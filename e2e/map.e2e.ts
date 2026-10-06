/**
 * The map, end to end: a real browser against a real server, the registry
 * on a local chain, a wallet that signs and sends with keys this script
 * holds, and Luma answered from fixtures.
 *
 *   bun run e2e                        the Bun server
 *   E2E_TARGET=vercel bun run e2e      the Vercel layout under Node
 *
 * Needs anvil (Foundry) on the PATH or in ANVIL_BIN, port 3000 free, and a
 * one-time `bunx playwright install chromium`. Screenshots of every step
 * land in the directory the run prints.
 */
import * as NFs from "node:fs/promises"
import * as NOs from "node:os"
import * as NPath from "node:path"
import { type BrowserContext, chromium, type Page } from "playwright"
import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"
import artifacts from "../contracts/artifacts.json" with { type: "json" }
import stubs from "./contracts/artifacts.json" with { type: "json" }

const Origin = "http://127.0.0.1:3000"

const Shots = NPath.join(NOs.tmpdir(), "homebase-e2e")

const ChainPort = 8545

const ChainRpc = `http://127.0.0.1:${ChainPort}`

/** Anvil's well-known funded accounts: the admin, a $home locker, and nobody. */
const keys = {
  admin: privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  ),
  locker: privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  ),
  stranger: privateKeyToAccount(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  ),
}

const wallets = {
  admin: keys.admin.address,
  locker: keys.locker.address,
  stranger: keys.stranger.address,
}

const chain = {
  ...foundry,
  rpcUrls: {
    default: {
      http: [
        ChainRpc,
      ],
    },
  },
}

const reader = createPublicClient({
  chain,
  transport: http(ChainRpc),
})

const as = (account: typeof keys.admin) =>
  createWalletClient({
    account,
    chain,
    transport: http(ChainRpc),
  })

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

const keyFor = (address: string) =>
  Object.values(keys).find((key) =>
    key.address.toLowerCase() === address.toLowerCase()
  ) ?? keys.stranger

/** What a wallet does with eth_sendTransaction: sign with the key behind the sender and send it on. */
async function send(tx: {
  from: string
  to?: string
  data?: string
  value?: string
}): Promise<unknown> {
  try {
    return await as(keyFor(tx.from)).sendTransaction({
      to: tx.to as Address,
      data: tx.data as Hex,
      value: tx.value ? BigInt(tx.value) : undefined,
    })
  } catch (error) {
    return {
      __error: {
        message: String((error as Error).message).split("\n")[0],
      },
    }
  }
}

/** Anything else the page asks the wallet is asked of the chain itself. */
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(ChainRpc, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  })
  const answer = await response.json() as {
    result?: unknown
    error?: {
      code: number
      message: string
      data?: unknown
    }
  }

  return answer.error
    ? {
      __error: answer.error,
    }
    : answer.result
}

/**
 * A wallet announced to the page the way browser wallets are (EIP-6963),
 * answering the requests wagmi and viem make: accounts and the chain from
 * here, transactions signed by this script, everything else from the chain.
 */
const walletScript = (address: string) =>
  `(() => {
  const address = ${JSON.stringify(address)}
  window.__walletCalls = []
  const answerOf = (reply) => {
    if (reply && typeof reply === "object" && reply.__error) {
      throw Object.assign(new Error(reply.__error.message), { code: reply.__error.code, data: reply.__error.data })
    }
    return reply
  }
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
        case "net_version":
          return "8453"
        case "wallet_switchEthereumChain":
          return null
        case "eth_sendTransaction":
          return answerOf(await window.__homebaseSend(params[0]))
        default:
          return answerOf(await window.__homebaseRpc(method, params ?? []))
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

/** What to stop at the end besides the server itself. */
const stops: (() => void)[] = []

/** A local chain with the registry on it, the admin wallet as its admin. */
async function startChain(): Promise<Address> {
  const anvil = process.env.ANVIL_BIN ?? Bun.which("anvil")

  if (!anvil) {
    throw new Error(
      "The suite needs anvil (Foundry) on the PATH or in ANVIL_BIN.",
    )
  }

  const node = Bun.spawn([
    anvil,
    "--port",
    String(ChainPort),
    "--silent",
  ], {
    stdout: "ignore",
    stderr: "ignore",
  })

  stops.push(() => node.kill())

  for (let tries = 0; tries < 100; tries += 1) {
    if (await reader.getChainId().then(() => true, () => false)) {
      break
    }

    await Bun.sleep(100)
  }

  return deploy(artifacts.HomebaseMap, [
    wallets.admin,
  ])
}

async function deploy(
  artifact: {
    abi: unknown
    bytecode: string
  },
  args: unknown[],
): Promise<Address> {
  const hash = await as(keys.admin).deployContract({
    abi: artifact.abi as [],
    bytecode: artifact.bytecode as Hex,
    args: args as never,
  })
  const receipt = await reader.waitForTransactionReceipt({
    hash,
  })

  return receipt.contractAddress!
}

/** The slugs on the chain right now, with who pinned them. */
const onChain = async (registry: Address) =>
  (await reader.readContract({
    address: registry,
    abi: artifacts.HomebaseMap.abi as [],
    functionName: "list" as never,
  }) as {
    slug: string
    by: Address
  }[])
    .map((pin) => [
      pin.slug,
      pin.by,
    ])

/**
 * The server under test: the Bun server by default, or with E2E_TARGET=vercel
 * the Vercel layout under Node, both pointed at the local chain.
 */
async function startServer(registry: Address) {
  const dataPath = await NFs.mkdtemp(
    NPath.join(NOs.tmpdir(), "homebase-e2e-data-"),
  )
  const vercel = process.env.E2E_TARGET === "vercel"
  const server = Bun.spawn(
    vercel
      ? [
        "node",
        "--import",
        "./e2e/luma-stub.ts",
        "e2e/vercel.ts",
      ]
      : [
        "bun",
        "--preload",
        "./e2e/luma-stub.ts",
        "src/server.ts",
      ],
    {
      env: {
        ...process.env,
        DATA_PATH: dataPath,
        HOMEBASE_MAP_REGISTRY: registry,
        HOMEBASE_BASE_RPC: ChainRpc,
        HOMEBASE_LIVE_ICAL: undefined,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
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

  await context.exposeFunction("__homebaseSend", send)
  await context.exposeFunction("__homebaseRpc", rpc)
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

async function connectWith(page: Page, name: "Test Wallet") {
  await page
    .getByRole("button", {
      name: "Connect wallet",
    })
    .click()
  await dialog(page)
    .getByRole("button", {
      name,
    })
    .waitFor({
      timeout: 30_000,
    })

  const offered = await dialog(page)
    .getByRole("list", {
      name: "Wallets",
    })
    .getByRole("button")
    .allInnerTexts()

  await dialog(page)
    .getByRole("button", {
      name,
    })
    .click()

  return offered
}

async function lookUpAndPin(page: Page, link: string) {
  await dialog(page).getByLabel("Luma link").fill(link)
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
  await dialog(page)
    .getByRole("button", {
      name: "Pin it to the map",
    })
    .click()
  await page.locator("article[aria-label]").waitFor({
    timeout: 30_000,
  })
  await page.waitForTimeout(1500)
}

const mapJson = async () =>
  (await (await fetch(`${Origin}/map.json?fresh=${Date.now()}`)).json()) as {
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

const registry = await startChain()
const server = await startServer(registry)
const browser = await chromium.launch()

try {
  // The admin: connect, pin, keep the wallet over a reload, remove, disconnect.
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
            name: "Connect wallet",
          })
          .count()) === 1
      && (await page.getByLabel("Luma link").count()) === 0,
  )

  const offered = await connectWith(page, "Test Wallet")

  check(
    "the page offers the announced wallet and Coinbase Wallet",
    offered.some((text) => text.includes("Test Wallet"))
      && offered.some((text) => text.includes("Coinbase Wallet")),
    offered.join(" | "),
  )
  await dialog(page).getByText(`Adding as ${short(wallets.admin)}`).waitFor({
    timeout: 30_000,
  })
  await shot(page, "02-connected")
  check(
    "the admin wallet is let in by the registry and gets the form",
    (await dialog(page).getByText("(admin)").count()) === 1
      && (await dialog(page).getByLabel("Luma link").count()) === 1,
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
  await shot(page, "03-preview")
  check(
    "the preview names the event",
    (await dialog(page).getByText("Based House Lisbon · Demo Day").count())
      === 1,
  )

  const before = await walletCalls(page)

  await dialog(page)
    .getByRole("button", {
      name: "Pin it to the map",
    })
    .click()
  await page.locator("article[aria-label]").waitFor({
    timeout: 30_000,
  })
  await page.waitForTimeout(1500)
  await shot(page, "04-pinned")

  const sent = (await walletCalls(page)).slice(before.length)
  const pinned = await mapJson()

  check(
    "pinning is one transaction from the wallet, and the pin is on the chain and on the map",
    sent.filter((method) => method === "eth_sendTransaction").length === 1
      && JSON.stringify(await onChain(registry)) === JSON.stringify([
          [
            "e2e-demo-day",
            wallets.admin,
          ],
        ])
      && pinned.events.length === 1
      && pinned.events[0].slug === "e2e-demo-day"
      && pinned.events[0].addedBy === wallets.admin,
    `${sent.join(" ")} | ${JSON.stringify(pinned)}`,
  )

  const again = await open(admin)

  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  check(
    "the wallet is picked back up after a reload",
    (await dialog(again)
      .getByText(`Adding as ${short(wallets.admin)}`)
      .count()) === 1,
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
  await shot(again, "05-remove-offered")
  await again
    .getByRole("button", {
      name: "Remove from map",
    })
    .click()
  await again.waitForTimeout(1500)
  check(
    "the admin can take the pin off the chain",
    (await onChain(registry)).length === 0
      && (await mapJson()).events.length === 0,
  )

  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await lookUpAndPin(again, "https://luma.com/e2e-build-night")
  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await dialog(again)
    .getByRole("button", {
      name: "Disconnect",
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
    "disconnecting takes the form away and offers the way back in",
    (await dialog(again).getByLabel("Luma link").count()) === 0
      && (await again
          .getByRole("button", {
            name: "Connect wallet",
          })
          .count()) === 1,
  )
  await admin.close()

  // A wallet that is nobody: it connects fine, and the registry turns it away.
  const stranger = await walletContext(wallets.stranger)
  const outsider = await open(stranger)

  await connectWith(outsider, "Test Wallet")
  await outsider.getByRole("alert").waitFor({
    timeout: 30_000,
  })
  await shot(outsider, "06-stranger")
  check(
    "a wallet the registry does not know is turned away, and never sees the form",
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

  // The lockers' turn: a gate on a stub lock, set on the registry by the admin.
  const lock = await deploy(stubs.StubLock, [])
  const gate = await deploy(artifacts.LockGate, [
    lock,
    100n,
  ])

  for (
    const call of [
      {
        address: registry,
        abi: artifacts.HomebaseMap.abi,
        functionName: "setGate",
        args: [
          gate,
        ],
      },
      {
        address: lock,
        abi: stubs.StubLock.abi,
        functionName: "setLocked",
        args: [
          wallets.locker,
          100n,
        ],
      },
    ]
  ) {
    const hash = await as(keys.admin).writeContract({
      address: call.address,
      abi: call.abi as [],
      functionName: call.functionName as never,
      args: call.args as never,
    })

    await reader.waitForTransactionReceipt({
      hash,
    })
  }

  const lockers = await walletContext(wallets.locker)
  const locker = await open(lockers)

  await connectWith(locker, "Test Wallet")
  await dialog(locker).getByText(`Adding as ${short(wallets.locker)}`).waitFor({
    timeout: 30_000,
  })
  await shot(locker, "07-locker")
  check(
    "a wallet with enough $home locked is let in through the gate",
    (await dialog(locker).getByText("($home locker)").count()) === 1,
  )
  await lookUpAndPin(locker, "https://luma.com/e2e-locker-night")
  await locker.keyboard.press("Escape")
  check(
    "the locker's pin is on the chain under its own wallet",
    JSON.stringify(await onChain(registry)) === JSON.stringify([
      [
        "e2e-build-night",
        wallets.admin,
      ],
      [
        "e2e-locker-night",
        wallets.locker,
      ],
    ]),
    JSON.stringify(await onChain(registry)),
  )

  const rows = locker.locator("li[id^=event-] [role=button]")

  await rows.first().click()
  await locker.locator("article[aria-label] h3").waitFor({
    timeout: 10_000,
  })

  const firstTitle = await locker.locator("article[aria-label] h3").innerText()
  const removeOnFirst = await locker
    .getByRole("button", {
      name: "Remove from map",
    })
    .count()

  await rows.nth(1).click()
  await locker.waitForTimeout(500)

  const secondTitle = await locker.locator("article[aria-label] h3").innerText()
  const removeOnSecond = await locker
    .getByRole("button", {
      name: "Remove from map",
    })
    .count()
  const own = firstTitle === "Locker night" ? removeOnFirst : removeOnSecond
  const other = firstTitle === "Locker night" ? removeOnSecond : removeOnFirst

  check(
    "a locker may remove its own pin and not the admin's",
    own === 1 && other === 0,
    `${firstTitle}: ${removeOnFirst}, ${secondTitle}: ${removeOnSecond}`,
  )

  if (secondTitle !== "Locker night") {
    await rows.first().click()
    await locker.waitForTimeout(500)
  }

  await locker
    .getByRole("button", {
      name: "Remove from map",
    })
    .click()
  await locker.waitForTimeout(1500)
  check(
    "the locker's pin comes off the chain",
    JSON.stringify(await onChain(registry)) === JSON.stringify([
      [
        "e2e-build-night",
        wallets.admin,
      ],
    ]),
  )
  await lockers.close()

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
  stops.forEach((stop) => stop())
}

const failed = checks.filter((item) => !item.ok)

console.log(
  `\n${
    checks.length - failed.length
  } of ${checks.length} checks passed against the ${
    process.env.E2E_TARGET === "vercel"
      ? "Vercel layout under Node"
      : "Bun server"
  }; screenshots in ${Shots}`,
)
process.exit(failed.length ? 1 : 0)
