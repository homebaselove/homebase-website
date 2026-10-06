/**
 * The map, end to end: a real browser against a real server, the Ethereum
 * Attestation Service on a local chain, a wallet that signs and sends with
 * keys this script holds, and Luma answered from fixtures.
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
  decodeAbiParameters,
  type Hex,
  http,
  parseAbi,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"
import eas from "./contracts/eas.json" with { type: "json" }

const Origin = "http://127.0.0.1:3000"

const Shots = NPath.join(NOs.tmpdir(), "homebase-e2e")

const ChainPort = 8545

const ChainRpc = `http://127.0.0.1:${ChainPort}`

/** Anvil's well-known funded accounts: the admin, and nobody. */
const keys = {
  admin: privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  ),
  stranger: privateKeyToAccount(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  ),
}

const wallets = {
  admin: keys.admin.address,
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

/** Where EAS and its schema registry landed on the local chain. */
interface Contracts {
  readonly eas: Address
  readonly schemaRegistry: Address
}

/** A local chain with EAS on it, the way Base ships it. */
async function startChain(): Promise<Contracts> {
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

  const schemaRegistry = await deploy(eas.SchemaRegistry, [])

  return {
    schemaRegistry,
    eas: await deploy(eas.EAS, [
      schemaRegistry,
    ]),
  }
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

const EasAbi = parseAbi([
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
])

/** The slugs attested on the chain and not revoked, with who attested them. */
async function onChain(contracts: Contracts) {
  const attested = await reader.getContractEvents({
    address: contracts.eas,
    abi: EasAbi,
    eventName: "Attested",
    fromBlock: 0n,
  })
  const pins: string[][] = []

  for (const event of attested) {
    const found = await reader.readContract({
      address: contracts.eas,
      abi: EasAbi,
      functionName: "getAttestation",
      args: [
        event.args.uid!,
      ],
    })

    if (found.revocationTime === 0n) {
      pins.push([
        decodeAbiParameters(
          [
            {
              type: "string",
            },
          ],
          found.data,
        )[0],
        found.attester,
      ])
    }
  }

  return pins
}

/**
 * The server under test: the Bun server by default, or with E2E_TARGET=vercel
 * the Vercel layout under Node, both pointed at the local chain and reading
 * its logs in place of EAS's indexer.
 */
async function startServer(contracts: Contracts) {
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
        HOMEBASE_EAS: contracts.eas,
        HOMEBASE_EAS_REGISTRY: contracts.schemaRegistry,
        HOMEBASE_EAS_INDEXER: "logs",
        HOMEBASE_ADMIN_ADDRESSES: wallets.admin,
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

/** The zoom the camera settled on, which the view writes on its container. */
const zoomOf = (page: Page) =>
  page.evaluate(() =>
    Number(
      document.querySelector<HTMLElement>("[data-zoom]")?.dataset.zoom ?? NaN,
    )
  )

/** Waits for the camera to come to rest between two zooms. */
const settledBetween = (page: Page, min: number, max: number) =>
  page.waitForFunction(
    ([low, high]) => {
      const zoom = Number(
        document.querySelector<HTMLElement>("[data-zoom]")?.dataset.zoom
          ?? NaN,
      )

      return zoom >= low && zoom <= high
    },
    [
      min,
      max,
    ] as const,
    {
      timeout: 15_000,
    },
  )

/** Whether the pin head of the first pin on the map is what the pointer would reach at its centre. */
const pinUncovered = (page: Page) =>
  page.evaluate(() => {
    const head = document.querySelector(".hb-pin-head")

    if (!head) {
      return false
    }

    const box = head.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    )

    return hit !== null && head.contains(hit)
  })

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

const contracts = await startChain()
const server = await startServer(contracts)
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
    "the admin wallet is let in and gets the form",
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
    "the first pin registers the schema and attests, two transactions, and the pin is on the chain and on the map",
    sent.filter((method) => method === "eth_sendTransaction").length === 2
      && JSON.stringify(await onChain(contracts)) === JSON.stringify([
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

  // The map starts once it is near the viewport, so a visitor scrolls down to it
  // and finds the whole world, with nothing selected.
  await again.evaluate(() =>
    document.getElementById("map-heading")?.closest("section")?.scrollIntoView({
      block: "start",
    })
  )
  await settledBetween(again, -1, 2)
  await shot(again, "05-world")
  check(
    "the map opens on the whole world",
    (await zoomOf(again)) < 2
      && (await again.locator("article[aria-label]").count()) === 0
      && (await again.locator(".hb-world[data-away]").count()) === 0,
    `zoom ${await zoomOf(again)}`,
  )

  // The house pin flies the camera in, and the card leaves the pin uncovered.
  await again.locator(".hb-pin").first().click()
  await again.locator("article[aria-label]").waitFor({
    timeout: 10_000,
  })
  await settledBetween(again, 11, 17)
  await again.waitForTimeout(400)
  await shot(again, "05-event")
  check(
    "the pin flies the camera in to the event, clear of its card",
    (await zoomOf(again)) >= 11
      && (await pinUncovered(again))
      && (await again.locator(".hb-world[data-away]").count()) === 1,
    `zoom ${await zoomOf(again)}`,
  )

  // Closing the card flies back out to the world.
  await again.keyboard.press("Escape")
  await settledBetween(again, -1, 2)
  check(
    "closing the card brings the whole world back",
    (await again.locator("article[aria-label]").count()) === 0
      && (await zoomOf(again)) < 2,
    `zoom ${await zoomOf(again)}`,
  )

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

  // With the page scrolled so the sections below the map are in view, the
  // open dialog must still be what the pointer would reach at its centre.
  await again.evaluate(() => scrollBy(0, 600))
  await again.waitForTimeout(300)

  const uppermost = await dialog(again).evaluate((panel) => {
    const box = panel.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    )

    return hit !== null && panel.contains(hit)
  })

  await shot(again, "05-dialog-over-page")
  check("the dialog lies over every section of the page", uppermost)
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
    "the admin revokes the pin, and it is off the chain and the map",
    (await onChain(contracts)).length === 0
      && (await mapJson()).events.length === 0,
  )

  const beforeSecond = await walletCalls(again)

  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await lookUpAndPin(again, "https://luma.com/e2e-build-night")

  const second = (await walletCalls(again)).slice(beforeSecond.length)

  check(
    "a later pin is one transaction, the schema being there already",
    second.filter((method) => method === "eth_sendTransaction").length === 1
      && JSON.stringify(await onChain(contracts)) === JSON.stringify([
          [
            "e2e-build-night",
            wallets.admin,
          ],
        ]),
    second.join(" "),
  )
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

  // A wallet that is nobody: it connects fine, and the map turns it away.
  const stranger = await walletContext(wallets.stranger)
  const outsider = await open(stranger)

  await connectWith(outsider, "Test Wallet")
  await outsider.getByRole("alert").waitFor({
    timeout: 30_000,
  })
  await shot(outsider, "06-stranger")
  check(
    "a wallet whose pins would not count is turned away, and never sees the form",
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
  await settledBetween(linked, 11, 17)
  check(
    "a deep link opens the event on a phone, straight on its pin",
    (await linked.locator("article[aria-label] h3").innerText())
        === "Lisbon build night"
      && (await zoomOf(linked)) >= 11
      && (await pinUncovered(linked)),
    `zoom ${await zoomOf(linked)}`,
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
