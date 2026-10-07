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
import { DonationAddress } from "../src/funding.ts"
import eas from "./contracts/eas.json" with { type: "json" }

/** The calendar feed the Luma stub serves, with two streams ahead. */
const LiveFeed = "https://api.lu.ma/ics/get?entity=calendar&id=cal-e2e"

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
        HOMEBASE_EAS: contracts.eas,
        HOMEBASE_EAS_REGISTRY: contracts.schemaRegistry,
        HOMEBASE_EAS_INDEXER: "logs",
        HOMEBASE_ADMIN_ADDRESSES: wallets.admin,
        HOMEBASE_BASE_RPC: ChainRpc,
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

const liveJson = async () =>
  (await (await fetch(`${Origin}/live.json?fresh=${Date.now()}`)).json()) as {
    calendars: {
      url: string
    }[]
    events: {
      start: string
    }[]
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
  await page.locator("[data-wallet=connected]").waitFor({
    timeout: 30_000,
  })
  await page
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await dialog(page).getByText(`Adding as ${short(wallets.admin)}`).waitFor({
    timeout: 30_000,
  })
  await shot(page, "02-connected")

  const headerReads = await page.locator("[data-wallet=connected]").innerText()

  check(
    "the admin wallet is let in from the header, the map offers Add an event, and the form is there",
    headerReads.includes(short(wallets.admin))
      && headerReads.toLowerCase().includes("admin")
      && (await dialog(page).getByText("(admin)").count()) === 1
      && (await dialog(page).getByLabel("Luma link").count()) === 1,
    headerReads,
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
    "the map opens on the whole world, the event a round badge on it",
    (await zoomOf(again)) < 2
      && (await again.locator("article[aria-label]").count()) === 0
      && (await again.locator(".hb-world[data-away]").count()) === 0
      && (await again
          .locator("button.hb-badge[data-slug=e2e-demo-day]")
          .count())
        === 1,
    `zoom ${await zoomOf(again)}`,
  )

  // Hovering the badge previews the event, with its step to Luma.
  await again.locator("button[data-slug=e2e-demo-day]").hover()
  await again.locator(".hb-preview").waitFor({
    timeout: 5_000,
  })
  await shot(again, "05-hover")
  check(
    "hovering a badge previews the event, one click from Luma",
    (await again.locator(".hb-preview a[href*=\"e2e-demo-day\"]").count())
        === 1
      && (await again.locator(".hb-preview").innerText())
        .includes("Based House Lisbon · Demo Day"),
  )
  await again.mouse.move(5, 5)
  await again.waitForTimeout(400)
  check(
    "the preview goes once the pointer has left",
    (await again.locator(".hb-preview").count()) === 0,
  )

  // The badge flies the camera in, where the event is a pin on its spot, and
  // the card leaves the pin uncovered.
  const flightStart = Date.now()

  await again.locator("button[data-slug=e2e-demo-day]").click()
  await again.locator("article[aria-label]").waitFor({
    timeout: 10_000,
  })

  const cardShownAfter = Date.now() - flightStart

  await settledBetween(again, 11, 17)

  const flightTook = Date.now() - flightStart

  await again.waitForTimeout(400)
  await shot(again, "05-event")
  check(
    "the card shows at once and the flight takes its time, an arc rather than a jump",
    cardShownAfter < 1_000 && flightTook >= 1_500 && flightTook <= 6_000,
    `card after ${cardShownAfter} ms, settled after ${flightTook} ms`,
  )
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

  // A second city, a week later and up the coast: at the world the two share
  // one badge, with the count and the ring for the soonest.
  await again
    .getByRole("button", {
      name: "Add an event",
    })
    .click()
  await lookUpAndPin(again, "https://luma.com/e2e-locker-night")
  check(
    "a second city is pinned",
    (await mapJson()).events.length === 2,
  )
  await again.keyboard.press("Escape")
  await settledBetween(again, -1, 2)
  await again.waitForTimeout(300)
  await shot(again, "06-two-cities-world")
  check(
    "two cities near each other share one badge at the world, with the count and the ring for the soonest",
    (await again.locator(".hb-badge-cluster .hb-badge-count").innerText())
        === "2"
      && (await again.locator("button[data-slug]").count()) === 0
      && (await again
          .locator(".hb-marker[data-next] .hb-badge-cluster")
          .count())
        === 1,
  )

  await again.locator(".hb-badge-cluster").hover()
  await again.locator(".hb-preview").waitFor({
    timeout: 5_000,
  })
  await shot(again, "06-cluster-preview")

  const previewText = await again.locator(".hb-preview").innerText()

  check(
    "the shared badge previews both events as links, marks the soonest, and keeps Luma text as text",
    (await again.locator(".hb-preview a[href*=\"e2e-\"]").count()) === 2
      && previewText.includes("2 events here")
      && /next up/i.test(previewText)
      && previewText.includes("Locker night <b>& more</b>")
      && (await again.locator(".hb-preview b").count()) === 0,
    previewText.replace(/\s+/g, " "),
  )
  await again.locator(".hb-preview-event").first().hover()
  await again.waitForTimeout(400)
  check(
    "the preview stays while the pointer is on it",
    (await again.locator(".hb-preview").count()) === 1,
  )
  await again.mouse.move(5, 5)
  await again.waitForTimeout(400)

  const splitStart = Date.now()

  await again.locator(".hb-badge-cluster").click()
  await settledBetween(again, 3, 10)

  const splitTook = Date.now() - splitStart

  await again.waitForTimeout(300)
  await shot(again, "06-split")
  check(
    "pressing the shared badge flies in until the cities stand apart, the ring on the soonest",
    (await again.locator("button[data-slug]").count()) === 2
      && (await again.locator(".hb-badge-cluster").count()) === 0
      && (await again
          .locator(".hb-marker[data-next] button[data-slug=e2e-build-night]")
          .count()) === 1
      && (await again
          .locator(".hb-marker[data-next] button[data-slug=e2e-locker-night]")
          .count()) === 0,
    `zoom ${await zoomOf(again)} after ${splitTook} ms`,
  )

  // The list and the map point at each other.
  await again.locator("#event-e2e-locker-night [role=button]").hover()
  await again.waitForTimeout(200)

  const rowLiftsBadge = (await again
    .locator(".hb-marker[data-hovered] button[data-slug=e2e-locker-night]")
    .count()) === 1

  await again.locator("button[data-slug=e2e-build-night]").hover()
  await again.waitForTimeout(200)

  const badgeLightsRow = (await again
    .locator("#event-e2e-build-night")
    .getAttribute("class") ?? "")
    .includes("bg-gray-50")

  await again.mouse.move(5, 5)
  await again.waitForTimeout(400)
  check(
    "hovering a row lifts its badge, and hovering a badge lights its row",
    rowLiftsBadge && badgeLightsRow,
  )

  // The keyboard reaches a badge, and Enter opens the card with all the preview had.
  await again.locator("button[data-slug=e2e-build-night]").focus()
  await again.keyboard.press("Enter")
  await again.locator("article[aria-label]").waitFor({
    timeout: 10_000,
  })
  await settledBetween(again, 11, 17)

  const card = again.locator("article[aria-label]")

  check(
    "Enter on a focused badge opens the card, which holds the title, the date and the Luma link the preview offered",
    (await card.locator("h3").innerText()) === "Lisbon build night"
      && (await card.locator("a[href*=\"e2e-build-night\"]").count()) === 1
      && (await card.innerText()).includes("Fri, Nov 20"),
  )
  await again.keyboard.press("Escape")
  await settledBetween(again, -1, 2)

  // Zooming by hand brings the world button, which takes the camera back.
  await again.locator(".maplibregl-ctrl-zoom-in").click()
  await settledBetween(again, 1, 1.9)
  await again.locator(".maplibregl-ctrl-zoom-in").click()
  await settledBetween(again, 2, 6)

  const awayShown = (await again.locator(".hb-world[data-away]").count()) === 1

  await again.locator(".hb-world-button").click()
  await settledBetween(again, -1, 2)
  check(
    "zooming by hand brings the world button, which takes the camera back to the world",
    awayShown && (await again.locator(".hb-world[data-away]").count()) === 0,
    `zoom ${await zoomOf(again)}`,
  )

  // The wheel scrolls the page over the map, and zooms it only with the key held.
  const centreOfMap = async () => {
    const box = await again.locator("[data-zoom]").boundingBox()

    if (box) {
      await again.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    }
  }

  await centreOfMap()

  const beforeWheel = await zoomOf(again)
  const scrollBefore = await again.evaluate(() => scrollY)

  await again.mouse.wheel(0, 240)
  await again.waitForTimeout(700)

  const afterPlainWheel = await zoomOf(again)
  const scrollAfter = await again.evaluate(() => scrollY)

  // The key held, as MapLibre sees it: a wheel event with the key on its canvas.
  await again.evaluate(() => {
    document.querySelector(".maplibregl-canvas")?.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -240,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await again.waitForTimeout(900)

  const afterKeyedWheel = await zoomOf(again)

  check(
    "the wheel scrolls the page over the map, and zooms it only with the key held",
    afterPlainWheel === beforeWheel
      && scrollAfter > scrollBefore
      && afterKeyedWheel > beforeWheel,
    `zoom ${beforeWheel} then ${afterPlainWheel} then ${afterKeyedWheel}; page ${scrollBefore} then ${scrollAfter}; view ${await again
      .locator("[data-zoom]")
      .getAttribute("data-view")}`,
  )
  await again.locator(".hb-world-button").click()
  await settledBetween(again, -1, 2)

  // Every control is big enough for a finger: 24 pixels each way, the badge over 44.
  const small = await again.evaluate(() => {
    const section = document.getElementById("map-heading")?.closest("section")

    if (!section) {
      return [
        "no map section",
      ]
    }

    return [
      ...section.querySelectorAll<HTMLElement>("button, a, [role=button]"),
    ]
      .filter((control) => control.offsetParent !== null)
      .map((control) => {
        const box = control.getBoundingClientRect()

        return {
          name: `${control.tagName.toLowerCase()}.${
            control.className.split(" ")[0]
          }`,
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      })
      .filter((control) => control.width < 24 || control.height < 24)
      .map((control) => `${control.name} ${control.width}x${control.height}`)
  })
  const badgeBox = await again.locator(".hb-badge").first().boundingBox()

  check(
    "every control on the map and in the list is at least 24 pixels each way, and a badge over 44",
    small.length === 0 && badgeBox !== null && badgeBox.width >= 44 && badgeBox
          .height >= 44,
    small.join(", ") || `badge ${badgeBox?.width}x${badgeBox?.height}`,
  )

  // Homebase Live: the admin adds a calendar feed, its events are listed, and takes it off again.
  await again.locator("#live-heading").scrollIntoViewIfNeeded()
  await again.getByText("No calendars yet.").waitFor({
    timeout: 10_000,
  })
  check(
    "Homebase Live opens empty, and offers the admin a calendar to add",
    (await again
          .getByRole("heading", {
            name: "Homebase Live",
          })
          .count()) === 1
      && (await again
          .getByRole("button", {
            name: "Add a calendar",
          })
          .count()) === 1
      && (await again.getByText("Nothing streaming ahead").count()) === 1,
  )

  const beforeCalendar = await walletCalls(again)

  await again
    .getByRole("button", {
      name: "Add a calendar",
    })
    .click()

  // A link the server would not fetch is refused before anything is signed.
  await dialog(again).getByLabel("Calendar feed link").fill(
    LiveFeed.replace("https://", "http://"),
  )
  await dialog(again)
    .getByRole("button", {
      name: "Look up",
    })
    .click()
  await dialog(again).getByRole("alert").waitFor({
    timeout: 10_000,
  })

  const refusal = await dialog(again).getByRole("alert").innerText()

  check(
    "a feed link that is not https is refused, and nothing is signed",
    refusal.includes("https only")
      && (await walletCalls(again))
          .slice(beforeCalendar.length)
          .filter((method) => method === "eth_sendTransaction")
          .length === 0
      && (await dialog(again)
          .getByRole("button", {
            name: "Add it to Homebase Live",
          })
          .count()) === 0,
    refusal,
  )

  await dialog(again).getByLabel("Calendar feed link").fill(LiveFeed)
  await dialog(again)
    .getByRole("button", {
      name: "Look up",
    })
    .click()
  await dialog(again)
    .getByRole("button", {
      name: "Add it to Homebase Live",
    })
    .waitFor({
      timeout: 30_000,
    })
  await shot(again, "07-calendar-preview")
  check(
    "the calendar's preview names it and counts what is ahead",
    (await dialog(again).getByText("Homebase on Luma").count()) === 1
      && (await dialog(again).getByText("2 events ahead.").count()) === 1,
  )
  await dialog(again)
    .getByRole("button", {
      name: "Add it to Homebase Live",
    })
    .click()
  await again.locator("[data-calendar]").waitFor({
    timeout: 30_000,
  })
  await again.waitForTimeout(1500)
  await shot(again, "07-calendar-added")

  const calendarSent = (await walletCalls(again)).slice(beforeCalendar.length)
  const live = await liveJson()

  check(
    "adding a calendar is two transactions the first time, its schema and the attestation, and its events are listed for everyone",
    calendarSent.filter((method) => method === "eth_sendTransaction").length
        === 2
      && live.calendars.length === 1
      && live.calendars[0].url === LiveFeed
      && live.events.length === 2
      && (await again.getByText("Demo day stream").count()) === 1
      && (await again.getByText("Office hours").count()) === 1,
    `${calendarSent.join(" ")} | ${JSON.stringify(live.calendars)}`,
  )

  // The day an event is listed under follows the chosen zone: noon UTC is the
  // next day east of the date line and the same day in Hawaii, two in the
  // morning in both.
  const liveRegion = again.getByRole("region", {
    name: "Homebase Live",
  })
  const firstStart = Date.parse(live.events[0].start)
  const dayAt = (at: number) => new Date(at).toISOString().slice(0, 10)
  const firstDay = () => liveRegion.locator("[data-day]").first()

  await liveRegion.getByRole("combobox").selectOption("Pacific/Kiritimati")
  await again.waitForTimeout(300)

  const eastDay = await firstDay().getAttribute("data-day")
  const eastReads = await firstDay().innerText()

  await liveRegion.getByRole("combobox").selectOption("Pacific/Honolulu")
  await again.waitForTimeout(300)

  const westDay = await firstDay().getAttribute("data-day")
  const westReads = await firstDay().innerText()

  check(
    "the day an event is listed under follows the chosen zone across the date line",
    eastDay === dayAt(firstStart + 14 * 60 * 60_000)
      && westDay === dayAt(firstStart - 10 * 60 * 60_000)
      && eastDay !== westDay
      && /2:00/.test(eastReads)
      && /2:00/.test(westReads),
    `${eastDay} east, ${westDay} west, from ${live.events[0].start}`,
  )

  await again
    .getByRole("button", {
      name: "Remove",
    })
    .click()
  await again.getByText("No calendars yet.").waitFor({
    timeout: 30_000,
  })
  await again.waitForTimeout(1000)
  check(
    "removing the calendar takes it off the chain and its events off the list",
    (await liveJson()).calendars.length === 0
      && (await again.getByText("Demo day stream").count()) === 0,
  )

  // A donation: ether from the connected wallet to the Based House wallet.
  const treasuryBefore = await reader.getBalance({
    address: DonationAddress,
  })

  await again.locator("#fund").scrollIntoViewIfNeeded()

  const beforeDonate = await walletCalls(again)

  await again.getByPlaceholder("Custom").fill("0")
  await again
    .getByRole("button", {
      name: "Donate",
    })
    .click()
  await again
    .getByRole("alert")
    .filter({
      hasText: "Enter an amount",
    })
    .waitFor({
      timeout: 10_000,
    })
  check(
    "Donate refuses an amount of nothing before the wallet is asked",
    (await again
          .getByRole("alert")
          .filter({
            hasText: "Enter an amount",
          })
          .innerText()) === "Enter an amount above zero."
      && (await walletCalls(again))
          .slice(beforeDonate.length)
          .filter((method) => method === "eth_sendTransaction")
          .length === 0,
  )

  await again
    .getByRole("button", {
      name: "0.01 ETH",
    })
    .click()
  await again
    .getByRole("button", {
      name: "Donate",
    })
    .click()
  await again.getByRole("status").waitFor({
    timeout: 30_000,
  })
  await shot(again, "07-donated")
  check(
    "Donate sends the chosen amount from the wallet to the Based House wallet",
    (await reader.getBalance({
              address: DonationAddress,
            })) - treasuryBefore === 10_000_000_000_000_000n
      && (await again.getByRole("status").innerText()).includes("Thank you"),
  )

  // One card: Buy $home and Lock $home on SeedMe, Donate from the wallet.
  const fundButtons = await again.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#fund a.btn-brand, #fund button.btn-brand",
      ),
    ]
      .map((item) =>
        `${item.textContent?.trim()} -> ${
          item.getAttribute("href") ?? "wallet"
        }`
      )
  )

  check(
    "the funding card offers Buy $home and Lock $home on SeedMe, and Donate from the wallet",
    fundButtons.join(" | ")
        === "Buy $home -> https://seedme.xyz | Lock $home -> https://seedme.xyz/lock | Donate -> wallet"
      && (await again
          .getByRole("heading", {
            name: "Lock $home",
          })
          .count()) === 0,
    fundButtons.join(" | "),
  )

  // The blueprint: picked up with the mouse it follows, and dropped it falls
  // back into place, taking its time even as the mouse moves on. Its carry
  // is read off its own transform, which holds the carry exactly, where the
  // box of a tilted slab would not.
  const blueprint = again.locator("[data-blueprint=frame]")
  const carryOf = (page: Page) =>
    page.evaluate(() => {
      const matrix = new DOMMatrix(
        getComputedStyle(document.querySelector("[data-blueprint=slab]")!)
          .transform,
      )

      return {
        x: Math.round(matrix.m41 * 10) / 10,
        y: Math.round(matrix.m42 * 10) / 10,
      }
    })

  await blueprint.scrollIntoViewIfNeeded()
  await again.waitForTimeout(300)

  const frameBox = (await blueprint.boundingBox())!
  const grabAt = {
    x: frameBox.x + frameBox.width / 2,
    y: frameBox.y + frameBox.height / 2,
  }

  await again.mouse.move(grabAt.x, grabAt.y)
  await again.mouse.down()
  await again.mouse.move(grabAt.x + 60, grabAt.y + 30, {
    steps: 6,
  })
  await again.mouse.move(grabAt.x + 120, grabAt.y + 60, {
    steps: 6,
  })
  await again.waitForTimeout(150)

  const carried = await carryOf(again)

  await shot(again, "12-blueprint-carried")
  await again.mouse.up()
  await again.mouse.move(grabAt.x + 110, grabAt.y + 50)
  await again.waitForTimeout(200)

  const falling = await carryOf(again)

  await again.waitForTimeout(1000)

  const dropped = await carryOf(again)

  check(
    "the blueprint follows the mouse when picked up, and falls back into place when dropped, even as the mouse moves on",
    carried.x === 120
      && carried.y === 60
      && falling.x > 0
      && falling.x < 120
      && dropped.x === 0
      && dropped.y === 0,
    `carried ${carried.x},${carried.y} falling ${falling.x},${falling.y} dropped ${dropped.x},${dropped.y}`,
  )

  // The header: the connected wallet by name, and the way out.
  await again.locator("[data-wallet=connected]").click()
  await dialog(again)
    .getByRole("heading", {
      name: "Your wallet",
    })
    .waitFor({
      timeout: 10_000,
    })

  const yourWallet = await dialog(again).innerText()

  await dialog(again)
    .getByRole("button", {
      name: "Disconnect",
    })
    .click()
  await again.locator("[data-wallet=none]").waitFor({
    timeout: 10_000,
  })
  await again.waitForTimeout(300)
  check(
    "the header dialog names the connected wallet, and disconnecting there takes the admin controls away",
    yourWallet.includes(short(wallets.admin))
      && yourWallet.includes("(admin)")
      && (await dialog(again).count()) === 0
      && (await again
          .getByRole("button", {
            name: "Connect wallet",
          })
          .count()) === 1
      && (await again
          .getByRole("button", {
            name: "Add an event",
          })
          .count()) === 0
      && (await again
          .getByRole("button", {
            name: "Add a calendar",
          })
          .count()) === 0,
    yourWallet.replace(/\s+/g, " "),
  )

  await connectWith(again, "Test Wallet")
  await again.locator("[data-wallet=connected]").waitFor({
    timeout: 30_000,
  })
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

  // A wallet that is nobody: Donate offers the way in, the wallet connects
  // fine, and nothing lets it add events or calendars.
  const stranger = await walletContext(wallets.stranger)
  const outsider = await open(stranger)

  await outsider.locator("#fund").scrollIntoViewIfNeeded()
  await outsider
    .getByRole("button", {
      name: "Donate",
    })
    .click()
  await dialog(outsider)
    .getByRole("heading", {
      name: "Connect a wallet",
    })
    .waitFor({
      timeout: 10_000,
    })
  await dialog(outsider)
    .getByRole("list", {
      name: "Wallets",
    })
    .waitFor({
      timeout: 30_000,
    })
  check(
    "Donate without a wallet opens the way in",
    (await dialog(outsider)
      .getByRole("list", {
        name: "Wallets",
      })
      .count()) === 1,
  )
  await outsider.keyboard.press("Escape")

  await connectWith(outsider, "Test Wallet")
  await outsider.locator("[data-wallet=connected]").waitFor({
    timeout: 30_000,
  })
  await outsider.waitForTimeout(800)
  await shot(outsider, "06-stranger")

  const strangerReads = await outsider
    .locator("[data-wallet=connected]")
    .innerText()

  check(
    "a wallet that is nobody connects, and sees no way to add events or calendars",
    strangerReads.includes(short(wallets.stranger))
      && !strangerReads.toLowerCase().includes("admin")
      && (await outsider
          .getByRole("button", {
            name: "Add an event",
          })
          .count()) === 0
      && (await outsider
          .getByRole("button", {
            name: "Add a calendar",
          })
          .count()) === 0
      && (await outsider.getByLabel("Luma link").count()) === 0,
    strangerReads,
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

  const hero = await open(visitor)

  await shot(hero, "10-phone-hero")

  const heroBoxes = await hero.evaluate(() => {
    const button = document.querySelector("[data-wallet]")
    const links = document.querySelector("nav[aria-label='Social links']")
    const house = button?.closest(".relative")?.querySelector(
      ".text-center > div",
    )

    if (!button || !links || !house) {
      return null
    }

    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()

      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    }

    return {
      button: box(button),
      links: box(links),
      house: box(house),
      width: innerWidth,
    }
  })

  const clearOfHouse = (
    item: {
      left: number
      right: number
      bottom: number
    },
  ) =>
    heroBoxes !== null
    && (item.right <= heroBoxes.house.left
      || item.left >= heroBoxes.house.right
      || item.bottom <= heroBoxes.house.top)
  const middle = (item: {
    top: number
    bottom: number
  }) => (item.top + item.bottom) / 2

  check(
    "on a phone the social links and the wallet button sit inside the screen on one line, clear of the house",
    heroBoxes !== null
      && heroBoxes.links.left >= 0
      && heroBoxes.links.right < heroBoxes.button.left
      && heroBoxes.button.right <= heroBoxes.width
      && Math.abs(middle(heroBoxes.links) - middle(heroBoxes.button)) <= 2
      && clearOfHouse(heroBoxes.links)
      && clearOfHouse(heroBoxes.button),
    JSON.stringify(heroBoxes),
  )
  await hero.close()
  await visitor.close()

  // With reduced motion asked for, the flight is a jump.
  const calm = await browser.newContext({
    viewport: {
      width: 1280,
      height: 900,
    },
    reducedMotion: "reduce",
  })
  const still = await open(calm)

  // The story reel opens on the interview, which waits on its poster with
  // nothing of the browser drawn over it until the reader presses Watch,
  // beside its text at the height of every card.
  await still.evaluate(() =>
    document.getElementById("story")?.scrollIntoView({
      block: "start",
    })
  )

  const opening = await still.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>("#story .story-reel")!
    const card = document.querySelector<HTMLElement>(
      "#story [data-chapter=jesse-at-based-house]",
    )!
    const video = card.querySelector("video")!

    return {
      dot: document
        .querySelector("#story [aria-current=step]")
        ?.getAttribute("aria-label") ?? String(),
      offCenter: Math.abs(
        card.offsetLeft
          + card.offsetWidth / 2
          - (scroller.scrollLeft + scroller.clientWidth / 2),
      ),
      paused: video.paused,
      controls: video.controls,
      autoplay: video.autoplay,
      preload: video.preload,
      poster: video.poster,
      src: video.getAttribute("src") ?? String(),
      watch: card.querySelector(".story-film button")?.textContent?.trim()
        ?? String(),
      film: card.querySelector<HTMLElement>(".story-film")!.offsetHeight,
      inside: card.querySelector("article")!.clientHeight,
    }
  })

  check(
    "the story reel opens on the interview, paused on its poster behind a Watch button",
    opening.dot === "Feb 2026: Jesse at Based House"
      && opening.offCenter < 2
      && opening.paused
      && !opening.controls
      && !opening.autoplay
      && opening.preload === "none"
      && opening.poster.includes("JesseAtBasedHouse")
      && opening.src === "/JesseAtBasedHouse.mp4#t=2.95"
      && opening.watch === "Watch · 11 min"
      && opening.film === opening.inside,
    JSON.stringify(opening),
  )

  await still.locator("#story .story-film button").click()

  const watching = await still.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(
      "#story [data-chapter=jesse-at-based-house] video",
    )!

    return {
      controls: video.controls,
      button: document.querySelector("#story .story-film button") !== null,
      focused: document.activeElement === video,
    }
  })

  check(
    "pressing Watch hands the video to the controls of the browser",
    watching.controls && !watching.button && watching.focused,
    JSON.stringify(watching),
  )

  // No arrows, one height for every card and every photo cover, and the
  // key numbers of a chapter inside What happened.
  await still
    .locator("#story button[aria-label^='Apr – May 2025']")
    .click()
  await still.waitForFunction(
    () => {
      const cover = document.querySelector<HTMLImageElement>(
        "#story [data-chapter=base-batches] .story-cover img",
      )

      return cover !== null && cover.complete && cover.naturalWidth > 0
    },
    null,
    {
      timeout: 30_000,
    },
  )
  await still.waitForTimeout(300)

  const reel = await still.evaluate(() => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>("#story [data-chapter]"),
    ]

    return {
      arrows: document
        .querySelectorAll(
          "#story button[aria-label='Previous chapter'], #story button[aria-label='Next chapter']",
        )
        .length,
      heights: cards.map((card) => card.querySelector("article")!.offsetHeight),
      covers: [
        ...document.querySelectorAll<HTMLElement>("#story .story-cover"),
      ]
        .map((cover) => cover.offsetHeight),
      cover: document
        .querySelector<HTMLImageElement>(
          "#story [data-chapter=base-batches] .story-cover img",
        )
        ?.src ?? String(),
      numbersShown: document
        .querySelector<HTMLElement>("#story [data-chapter=base-batches] dl")
        ?.checkVisibility() ?? null,
    }
  })

  check(
    "the story reel has no arrows, and every card and every photo cover stands at one height",
    reel.arrows === 0
      && new Set(reel.heights).size === 1
      && reel.covers.length === reel.heights.length - 1
      && new Set(reel.covers).size === 1
      && reel.covers[0] > 0,
    `cards ${reel.heights.join(" ")}, covers ${reel.covers.join(" ")}`,
  )
  check(
    "the third chapter carries the Homebase Map post as its cover, with its key numbers kept inside What happened",
    reel.cover.includes("HomebaseMapAnnouncement")
      && reel.numbersShown === false,
    `${reel.cover} numbers shown: ${reel.numbersShown}`,
  )

  await still.locator("#story [data-chapter=base-batches] summary").click()
  await still.waitForTimeout(300)
  await shot(still, "11-story-numbers")

  const numbers = await still
    .locator("#story [data-chapter=base-batches] dl")
    .innerText()

  check(
    "opening What happened shows the numbers, 10k+ viewers among them",
    (await still
      .locator("#story [data-chapter=base-batches] dl")
      .evaluate((list) => list.checkVisibility()))
      && /10k\+\s+viewers/.test(numbers)
      && !/map of every meetup/.test(numbers),
    numbers.replace(/\s+/g, " "),
  )

  await still.evaluate(() =>
    document.getElementById("map-heading")?.closest("section")?.scrollIntoView({
      block: "start",
    })
  )
  await settledBetween(still, -1, 2)

  const jumpStart = Date.now()

  await still.locator(".hb-badge-cluster").click()
  await settledBetween(still, 3, 10)

  const jumpTook = Date.now() - jumpStart

  check(
    "with reduced motion asked for, the flight is a jump",
    jumpTook < 900,
    `${jumpTook} ms`,
  )
  await calm.close()

  // On a touchscreen there is no hover: a tap on the shared badge splits it,
  // and a tap on a badge goes straight to the card.
  const touch = await browser.newContext({
    viewport: {
      width: 390,
      height: 844,
    },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
  const thumb = await open(touch)

  await thumb.evaluate(() =>
    document.getElementById("map-heading")?.closest("section")?.scrollIntoView({
      block: "start",
    })
  )
  await settledBetween(thumb, -2, 2)
  await thumb.locator(".hb-badge-cluster").tap()
  await settledBetween(thumb, 3, 10)
  await thumb.locator("button[data-slug=e2e-build-night]").tap()
  await thumb.locator("article[aria-label]").waitFor({
    timeout: 10_000,
  })
  await settledBetween(thumb, 11, 17)
  await thumb.waitForTimeout(300)
  await shot(thumb, "09-touch-card")
  check(
    "on a touchscreen a tap splits the shared badge, a tap opens the card, and no preview appears",
    (await thumb.locator("article[aria-label] h3").innerText())
        === "Lisbon build night"
      && (await thumb.locator(".hb-preview").count()) === 0
      && (await pinUncovered(thumb)),
    `hover-capable: ${await thumb.evaluate(() =>
      matchMedia("(hover: hover)").matches
    )}`,
  )

  // A finger picks the blueprint up too: it follows, the page stays put, and
  // it falls back on release.
  const fingerFrame = thumb.locator("[data-blueprint=frame]")

  await fingerFrame.scrollIntoViewIfNeeded()
  await thumb.waitForTimeout(300)

  const finger = await touch.newCDPSession(thumb)
  const fingerSlab = () =>
    thumb.evaluate(() => {
      const matrix = new DOMMatrix(
        getComputedStyle(document.querySelector("[data-blueprint=slab]")!)
          .transform,
      )

      return {
        x: Math.round(matrix.m41 * 10) / 10,
        y: Math.round(matrix.m42 * 10) / 10,
      }
    })
  const fingerBox = (await fingerFrame.boundingBox())!
  const touchAt = {
    x: fingerBox.x + fingerBox.width / 2,
    y: fingerBox.y + fingerBox.height / 2,
  }
  const pageBefore = await thumb.evaluate(() => scrollY)

  await finger.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      touchAt,
    ],
  })
  for (
    const step of [
      1,
      2,
      3,
      4,
    ]
  ) {
    await finger.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: touchAt.x + 20 * step,
          y: touchAt.y + 15 * step,
        },
      ],
    })
    await thumb.waitForTimeout(40)
  }
  await thumb.waitForTimeout(150)

  const carriedByFinger = await fingerSlab()
  const pageDuring = await thumb.evaluate(() => scrollY)

  await finger.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await thumb.waitForTimeout(1100)

  const droppedByFinger = await fingerSlab()

  check(
    "on a touchscreen a finger moving sideways picks the blueprint up, the page stays put, and it falls back on release",
    carriedByFinger.x === 80
      && carriedByFinger.y === 60
      && pageDuring === pageBefore
      && droppedByFinger.x === 0
      && droppedByFinger.y === 0,
    `carried ${carriedByFinger.x},${carriedByFinger.y} dropped ${droppedByFinger.x},${droppedByFinger.y}; page ${pageBefore} then ${pageDuring}`,
  )

  // A finger moving up the blueprint scrolls the page as it would anywhere,
  // and leaves the blueprint at rest.
  const swipeFrom = await thumb.evaluate(() => scrollY)

  await finger.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      touchAt,
    ],
  })
  for (
    const step of [
      1,
      2,
      3,
      4,
    ]
  ) {
    await finger.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: touchAt.x,
          y: touchAt.y - 40 * step,
        },
      ],
    })
    await thumb.waitForTimeout(40)
  }
  await finger.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await thumb.waitForTimeout(1100)

  const swipeTo = await thumb.evaluate(() => scrollY)
  const afterSwipe = await fingerSlab()

  check(
    "on a touchscreen a finger moving up the blueprint scrolls the page and leaves the blueprint at rest",
    swipeTo > swipeFrom
      && afterSwipe.x === 0
      && afterSwipe.y === 0,
    `page ${swipeFrom} then ${swipeTo}; blueprint ${afterSwipe.x},${afterSwipe.y}`,
  )
  await touch.close()
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
