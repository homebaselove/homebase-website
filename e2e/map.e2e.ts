/**
 * The map, end to end: a real browser against a real server, with a wallet
 * that signs with a key this script holds, and Luma answered from fixtures.
 *
 *   bun run e2e
 *
 * Port 3000 must be free, and the browser comes from a one-time
 * `bunx playwright install chromium`. Screenshots of every step land in the
 * directory the run prints.
 */
import * as NFs from "node:fs/promises"
import * as NOs from "node:os"
import * as NPath from "node:path"
import * as Address from "ox/Address"
import * as Hex from "ox/Hex"
import * as PersonalMessage from "ox/PersonalMessage"
import * as Secp256k1 from "ox/Secp256k1"
import * as Signature from "ox/Signature"
import { type BrowserContext, chromium, type Page } from "playwright"

const Origin = "http://127.0.0.1:3000"

const Shots = NPath.join(NOs.tmpdir(), "homebase-e2e")

const keys = {
  admin: Secp256k1.randomPrivateKey(),
  stranger: Secp256k1.randomPrivateKey(),
}

const addressOf = (privateKey: Hex.Hex) =>
  Address.checksum(
    Address.fromPublicKey(Secp256k1.getPublicKey({
      privateKey,
    })),
  )

const wallets = {
  admin: addressOf(keys.admin),
  stranger: addressOf(keys.stranger),
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

/** What a wallet does with personal_sign, done here with the key behind the address. */
function sign(messageHex: string, address: string): string {
  const privateKey = Address.isEqual(address as Address.Address, wallets.admin)
    ? keys.admin
    : keys.stranger

  return Signature.toHex(
    Secp256k1.sign({
      payload: PersonalMessage.getSignPayload(messageHex as Hex.Hex),
      privateKey,
    }),
  )
}

/**
 * A wallet announced to the page the way browser wallets are (EIP-6963),
 * answering the requests wagmi makes; the signature comes from this script.
 */
const walletScript = (address: string) =>
  `(() => {
  const address = ${JSON.stringify(address)}
  window.__walletCalls = []
  const provider = {
    request: async ({ method, params }) => {
      window.__walletCalls.push(method)
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [address]
        case "wallet_requestPermissions":
          return [{ parentCapability: "eth_accounts", caveats: [{ type: "restrictReturnedAccounts", value: [address] }] }]
        case "eth_chainId":
          return "0x2105"
        case "wallet_switchEthereumChain":
          return null
        case "personal_sign":
          return await window.__homebaseSign(params[0], params[1])
        default:
          throw Object.assign(new Error("unsupported " + method), { code: -32601 })
      }
    },
    on: () => {},
    removeListener: () => {},
  }
  const detail = Object.freeze({
    info: {
      uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      name: "Test Wallet",
      icon: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0000ff"/></svg>'),
      rdns: "love.homebase.testwallet",
    },
    provider,
  })
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }))
  window.addEventListener("eip6963:requestProvider", announce)
  announce()
})()`

const checks: {
  name: string
  ok: boolean
  detail?: string
}[] = []

function check(name: string, ok: boolean, detail?: string) {
  checks.push({
    name,
    ok,
    detail,
  })
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name}${detail && !ok ? `: ${detail}` : ""}`,
  )
}

/** Everything the server printed, shown when the run fails. */
let serverLog = String()

async function startServer() {
  const dataPath = await NFs.mkdtemp(
    NPath.join(NOs.tmpdir(), "homebase-e2e-data-"),
  )
  const server = Bun.spawn([
    "bun",
    "--preload",
    "./e2e/luma-stub.ts",
    "src/server.ts",
  ], {
    env: {
      ...process.env,
      DATA_PATH: dataPath,
      HOMEBASE_ADMIN_ADDRESSES: wallets.admin,
      HOMEBASE_SITE_HOSTS: undefined,
      HOMEBASE_LIVE_ICAL: undefined,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const listening = new Promise<void>((resolve, reject) => {
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          return
        }

        serverLog += new TextDecoder().decode(value)

        if (serverLog.includes("Listening on")) {
          resolve()
        }

        if (serverLog.includes("Is port 3000 in use")) {
          reject(
            new Error(
              "Port 3000 is in use. Stop the dev server and run again.",
            ),
          )
        }
      }
    }

    read(server.stdout)
    read(server.stderr)
    setTimeout(
      () => reject(new Error(`The server did not start:\n${serverLog}`)),
      60_000,
    )
  })

  await listening

  return server
}

/** The page the run is on, for the screenshot a failure leaves behind. */
const run: {
  page: Page | null
} = {
  page: null,
}

async function open(
  context: BrowserContext,
  path = "/",
): Promise<Page> {
  const page = await context.newPage()

  run.page = page

  page.on("pageerror", (error) => {
    check(`no page error (${path})`, false, error.message)
  })
  await page.route(
    "https://tiles.openfreemap.org/**",
    (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [],
        },
      }),
  )
  await page.route(/images\.lumacdn\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body:
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"400\"><rect width=\"800\" height=\"400\" fill=\"#0000ff\"/></svg>",
    }))
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
  await page.goto(`${Origin}${path}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  })

  return page
}

async function walletContext(address: string) {
  const context = await browser.newContext({
    viewport: {
      width: 1280,
      height: 900,
    },
    deviceScaleFactor: 2,
  })

  await context.exposeFunction("__homebaseSign", sign)
  await context.addInitScript(walletScript(address))

  return context
}

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: NPath.join(Shots, `${name}.png`),
  })

const dialog = (page: Page) => page.getByRole("dialog")

/** Every request the fake wallet has answered on the page, in order. */
const walletCalls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as {
      __walletCalls: string[]
    })
      .__walletCalls
  )

async function connectAndSignIn(page: Page) {
  await page
    .getByRole("button", {
      name: "Sign in",
    })
    .click()
  await dialog(page)
    .getByRole("button", {
      name: "Test Wallet",
    })
    .waitFor({
      timeout: 30_000,
    })
  await shot(page, "02-wallets")

  const offered = await dialog(page)
    .getByRole("list", {
      name: "Wallets",
    })
    .getByRole("button")
    .allInnerTexts()

  await dialog(page)
    .getByRole("button", {
      name: "Test Wallet",
    })
    .click()

  return offered
}

const mapJson = async () =>
  (await (await fetch(`${Origin}/map.json`)).json()) as {
    events: {
      slug: string
      addedBy: string
    }[]
  }

await NFs.rm(Shots, {
  recursive: true,
  force: true,
})
await NFs.mkdir(Shots, {
  recursive: true,
})

const server = await startServer()
const browser = await chromium.launch()

try {
  // An admin: connect, sign in, look up, pin, keep the session, remove, sign out.
  const admin = await walletContext(wallets.admin)
  const page = await open(admin)

  await shot(page, "01-empty")
  check(
    "the map starts empty",
    (await page.getByText("No upcoming events pinned yet").count()) === 1,
  )
  check(
    "a visitor sees no way to add events, only the way in",
    (await page
          .getByRole("button", {
            name: "Add an event",
          })
          .count()) === 0
      && (await page
          .getByRole("button", {
            name: "Sign in",
          })
          .count()) === 1
      && (await page.getByLabel("Luma link").count()) === 0,
  )

  // The first sign-in meets a deployment with no store, the way an unconfigured Vercel answers.
  let nonces = 0

  await page.route("**/auth/nonce.json", (route) => {
    nonces += 1

    return nonces === 1
      ? route.fulfill({
        status: 503,
        json: {
          error: "The map's store isn't set up on this deployment.",
        },
      })
      : route.continue()
  })

  const offered = await connectAndSignIn(page)

  check(
    "the page offers the announced wallet and Coinbase Wallet",
    offered.some((text) => text.includes("Test Wallet"))
      && offered.some((text) => text.includes("Coinbase Wallet")),
    offered.join(" | "),
  )
  await dialog(page).getByRole("alert").waitFor({
    timeout: 30_000,
  })
  check(
    "a deployment without a store says so, and keeps the wallets on offer",
    (await dialog(page).getByRole("alert").innerText()).includes("isn't set up")
      && (await dialog(page)
          .getByRole("button", {
            name: "Test Wallet",
          })
          .count()) === 1,
    await dialog(page).getByRole("alert").innerText(),
  )

  const before = await walletCalls(page)

  await dialog(page)
    .getByRole("button", {
      name: "Test Wallet",
    })
    .click()
  await dialog(page).getByText(`Adding as ${short(wallets.admin)}`).waitFor({
    timeout: 30_000,
  })

  const retry = (await walletCalls(page)).slice(before.length)
  const connects = (calls: string[]) =>
    calls
      .filter((method) =>
        method === "eth_requestAccounts"
        || method === "wallet_requestPermissions"
      )
      .length
  const signs = (calls: string[]) =>
    calls.filter((method) => method === "personal_sign").length

  check(
    "the second try reuses the connected wallet and signs once",
    connects(before) > 0
      && signs(before) === 0
      && connects(retry) === 0
      && signs(retry) === 1,
    `first: ${before.join(" ")} | retry: ${retry.join(" ")}`,
  )
  await shot(page, "03-signed-in")
  check(
    "the admin wallet is signed in and gets the form",
    (await dialog(page).getByLabel("Luma link").count()) === 1,
  )

  await dialog(page).getByLabel("Luma link").fill(
    "https://lu.ma/e2e-demo-day?tk=secret",
  )
  await dialog(page)
    .getByRole("button", {
      name: "Look up",
    })
    .click()
  await dialog(page)
    .getByRole("button", {
      name: "Pin it to the map",
    })
    .waitFor({
      timeout: 30_000,
    })
  await shot(page, "04-preview")
  check(
    "the preview names the event",
    (await dialog(page).getByText("Based House Lisbon · Demo Day").count())
      === 1,
  )

  await dialog(page)
    .getByRole("button", {
      name: "Pin it to the map",
    })
    .click()
  await page.locator("article[aria-label]").waitFor({
    timeout: 30_000,
  })
  await page.waitForTimeout(1500)
  await shot(page, "05-pinned")

  const pinned = await mapJson()

  check(
    "the pin is on the map, added by the admin wallet",
    pinned.events.length === 1
      && pinned.events[0].slug === "e2e-demo-day"
      && pinned.events[0].addedBy === wallets.admin,
    JSON.stringify(pinned),
  )

  const again = await open(admin)

  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  check(
    "the session survives a reload",
    (await dialog(again).getByText(`Adding as ${short(wallets.admin)}`).count())
      === 1,
  )
  await again.keyboard.press("Escape")
  await again.locator("li[id^=event-] [role=button]").first().click()
  await again
    .getByRole("button", {
      name: "Remove from map",
    })
    .waitFor({
      timeout: 10_000,
    })
  await shot(again, "06-remove-offered")
  await again
    .getByRole("button", {
      name: "Remove from map",
    })
    .click()
  await again.waitForTimeout(1000)
  check("the admin can remove the pin", (await mapJson()).events.length === 0)

  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await dialog(again).getByLabel("Luma link").fill(
    "https://luma.com/e2e-build-night",
  )
  await dialog(again)
    .getByRole("button", {
      name: "Look up",
    })
    .click()
  await dialog(again)
    .getByRole("button", {
      name: "Pin it to the map",
    })
    .click()
  await again.locator("article[aria-label]").waitFor({
    timeout: 30_000,
  })
  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await dialog(again)
    .getByRole("button", {
      name: "Sign out",
    })
    .click()
  await dialog(again)
    .getByRole("button", {
      name: "Test Wallet",
    })
    .waitFor({
      timeout: 30_000,
    })
  check(
    "signing out takes the form away and offers the way back in",
    (await dialog(again).getByLabel("Luma link").count()) === 0
      && (await again
          .getByRole("button", {
            name: "Sign in",
          })
          .count()) === 1,
  )
  await admin.close()

  // A wallet that is nobody: it signs fine, and the server turns it away.
  const stranger = await walletContext(wallets.stranger)
  const outsider = await open(stranger)

  await connectAndSignIn(outsider)
  await outsider.getByRole("alert").waitFor({
    timeout: 30_000,
  })
  await shot(outsider, "07-stranger")
  check(
    "a wallet that is not an admin is turned away, and never sees the form",
    (await outsider.getByRole("alert").innerText()).includes(
      "can't add events yet",
    )
      && (await outsider.getByLabel("Luma link").count()) === 0
      && (await outsider
          .getByRole("button", {
            name: "Add an event",
          })
          .count()) === 0,
    await outsider.getByRole("alert").innerText(),
  )
  await stranger.close()

  // The deep link, with no wallet at all.
  const visitor = await browser.newContext({
    viewport: {
      width: 390,
      height: 844,
    },
    deviceScaleFactor: 2,
  })
  const linked = await open(visitor, "/?event=e2e-build-night")

  await linked.locator("article[aria-label]").waitFor({
    timeout: 30_000,
  })
  await shot(linked, "08-deep-link-mobile")
  check(
    "a deep link opens the event on a phone",
    (await linked.locator("article[aria-label] h3").innerText())
      === "Lisbon build night",
  )
  await visitor.close()
} catch (error) {
  check("the run completed", false, String(error))

  if (run.page && !run.page.isClosed()) {
    await shot(run.page, "99-failure").catch(() => {})
    console.log(
      `The page read:\n${await run.page.innerText("body").catch(() =>
        "(gone)"
      )}`,
    )
  }

  console.log(`The server printed:\n${serverLog.slice(-4000)}`)
} finally {
  await browser.close()
  server.kill()
}

const failed = checks.filter((item) => !item.ok)

console.log(
  `\n${
    checks.length - failed.length
  } of ${checks.length} checks passed; screenshots in ${Shots}`,
)
process.exit(failed.length ? 1 : 0)
