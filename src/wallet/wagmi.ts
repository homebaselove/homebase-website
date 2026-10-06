/**
 * Wallets, through wagmi core. The map page loads none of this until someone
 * presses Connect, when the browser fetches it as its own bundle.
 *
 * Every wallet reaches wagmi as an EIP-1193 provider behind its injected
 * connector: the wallets that announce themselves on the page (EIP-6963),
 * the host's wallet inside a Farcaster mini app, which the page hands in
 * since its SDK is already there, and Coinbase's through its SDK, which
 * offers the Coinbase Wallet app and extension as well as a passkey smart
 * wallet for people with nothing installed. This is what wagmi's own
 * coinbaseWallet connector does, with one difference: no permissions
 * request before the accounts, which that SDK does not answer.
 *
 * A pin is an attestation on Base. The wallet only signs and sends it; the
 * reads before it, the dry run and the wait for the receipt go through
 * Base's public RPC, which answers a refused call with the reason, where a
 * wallet's own relay may not.
 */
import {
  connect,
  createConfig,
  disconnect,
  getAccount,
  getConnectorClient,
  http,
  injected,
  reconnect,
  switchChain,
} from "@wagmi/core"
import { base } from "@wagmi/core/chains"
import {
  type Address,
  createPublicClient,
  type EIP1193Provider,
  encodeAbiParameters,
  type Hash,
  type Hex,
  http as viemHttp,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  zeroHash,
} from "viem"
import { writeContract } from "viem/actions"

export interface Wallet {
  readonly id: string
  readonly name: string
  /** A data: URI the wallet announced, or nothing for the ones added here. */
  readonly icon: string | null
}

/** Where pins are attested, as the server tells the page. */
export interface Eas {
  readonly chainId: number
  readonly address: string
  readonly schemaRegistry: string
  readonly schema: string
  readonly schemaText: string
  /** The public RPC the page reads the chain with; the wallet only signs. */
  readonly rpc: string
}

/** EAS's calls and events, with its errors so a refusal is named, not numbered. */
const EasAbi = parseAbi([
  "function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) payable returns (bytes32)",
  "function revoke((bytes32 schema, (bytes32 uid, uint256 value) data) request) payable",
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
  "error AccessDenied()",
  "error AlreadyRevoked()",
  "error InsufficientValue()",
  "error InvalidAttestation()",
  "error InvalidExpirationTime()",
  "error InvalidLength()",
  "error InvalidRevocation()",
  "error InvalidSchema()",
  "error Irrevocable()",
  "error NotFound()",
  "error NotPayable()",
  "error WrongSchema()",
])

const RegistryAbi = parseAbi([
  "function register(string schema, address resolver, bool revocable) returns (bytes32)",
  "function getSchema(bytes32 uid) view returns ((bytes32 uid, address resolver, bool revocable, string schema))",
  "error AlreadyExists()",
])

const makeReader = (rpc: string) =>
  createPublicClient({
    chain: base,
    transport: viemHttp(rpc),
  })

type Reader = ReturnType<typeof makeReader>

const readers = new Map<string, Reader>()

/** A client on Base's public RPC, one per address, for everything but signing. */
function reader(rpc: string): Reader {
  const found = readers.get(rpc)

  if (found) {
    return found
  }

  const made = makeReader(rpc)

  readers.set(rpc, made)

  return made
}

const CoinbaseId = "coinbase-smart-wallet"

const HostId = "host"

const BrowserId = "browser"

/** How long wallets get to answer the page's request to announce themselves. */
const AnnounceWaitMs = 150

/** How long a sent transaction gets to land before the page stops waiting. */
const ReceiptWaitMs = 120_000

const config = createConfig({
  chains: [
    base,
  ],
  transports: {
    [base.id]: http(),
  },
  multiInjectedProviderDiscovery: true,
})

/** The wallet of the app hosting the page, when the page found one. */
let hosted: EIP1193Provider | null = null

let coinbase: Promise<EIP1193Provider> | null = null

/**
 * Coinbase's SDK and its provider, made once. Making it opens nothing; the
 * popup comes with the first request, so it is started while the list is
 * on screen and the click that follows reaches the popup with no wait.
 */
function coinbaseProvider(): Promise<EIP1193Provider> {
  coinbase ??= (async () => {
    const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk")

    return createCoinbaseWalletSDK({
      appName: "Homebase",
      appChainIds: [
        base.id,
      ],
      preference: {
        options: "all",
      },
    })
      .getProvider() as unknown as EIP1193Provider
  })()
  coinbase.catch(() => {
    coinbase = null
  })

  return coinbase
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The wallets to offer, in the order they are shown. Inside a host app its
 * wallet is the only one; elsewhere, the wallets on the page and Coinbase.
 */
export async function wallets(
  host: EIP1193Provider | null = null,
): Promise<Wallet[]> {
  hosted = host

  if (hosted) {
    return [
      {
        id: HostId,
        name: "Wallet in this app",
        icon: null,
      },
    ]
  }

  await wait(AnnounceWaitMs)

  const announced = config
    .connectors
    .filter((connector) => connector.type === "injected" && connector.icon)
    .map((connector) => ({
      id: connector.id,
      name: connector.name,
      icon: connector.icon ?? null,
    }))
  const found: Wallet[] = [
    ...announced,
  ]

  if (announced.length === 0 && "ethereum" in window && window.ethereum) {
    found.push({
      id: BrowserId,
      name: "Browser wallet",
      icon: null,
    })
  }

  if (!announced.some((wallet) => /coinbase/i.test(wallet.name))) {
    coinbaseProvider().catch(() => {})
    found.push({
      id: CoinbaseId,
      name: "Coinbase Wallet",
      icon: null,
    })
  }

  return found
}

/**
 * The connector for a wallet added here. Permissions are not asked for
 * first: the SDK providers do not answer that request, and sending it would
 * only put a round trip between the click and the popup it has to open.
 */
const added = (id: string, name: string, provider: EIP1193Provider) =>
  injected({
    target: {
      id,
      name,
      provider,
    },
    shimDisconnect: false,
  })

async function connectorFor(id: string) {
  if (id === HostId) {
    if (!hosted) {
      throw new Error("The host's wallet is only there inside its app.")
    }

    return added(id, "Wallet in this app", hosted)
  }

  if (id === CoinbaseId) {
    return added(id, "Coinbase Wallet", await coinbaseProvider())
  }

  if (id === BrowserId) {
    if (!("ethereum" in window) || !window.ethereum) {
      throw new Error("The browser wallet is no longer on the page.")
    }

    return added(id, "Browser wallet", window.ethereum as EIP1193Provider)
  }

  const announced = config.connectors.find((connector) => connector.id === id)

  if (!announced) {
    throw new Error("That wallet is no longer on the page.")
  }

  return announced
}

/**
 * Connects the chosen wallet and hands back its account. A wallet that is
 * still connected from an earlier try is reused rather than asked again.
 * The wallet is not asked to switch chains here: that waits for a pin, so
 * connecting never hangs on a prompt some wallets only show on the phone.
 */
export async function connectWallet(id: string): Promise<Address> {
  const current = getAccount(config)

  if (current.status === "connected" && current.connector.id === id) {
    return current.address
  }

  if (current.status !== "disconnected") {
    await disconnect(config).catch(() => {})
  }

  const connected = await connect(config, {
    connector: await connectorFor(id),
  })

  return connected.accounts[0]
}

/**
 * Picks a connection back up after a reload, without a prompt, if the wallet
 * still allows it; null when it does not.
 */
export async function reconnectWallet(id: string): Promise<Address | null> {
  await wait(AnnounceWaitMs)

  try {
    await reconnect(config, {
      connectors: [
        await connectorFor(id),
      ],
    })
  } catch {
    return null
  }

  const account = getAccount(config)

  return account.status === "connected" ? account.address : null
}

/** The connected wallet's client on Base, the wallet switched there if need be. */
async function signer() {
  if (getAccount(config).chainId !== base.id) {
    await switchChain(config, {
      chainId: base.id,
    })
  }

  return getConnectorClient(config)
}

async function landed(chain: Reader, hash: Hash) {
  const receipt = await chain.waitForTransactionReceipt({
    hash,
    timeout: ReceiptWaitMs,
  })

  if (receipt.status !== "success") {
    throw new Error("The transaction was reverted.")
  }

  return receipt
}

/**
 * Pins a slug: an attestation under the map's schema from the connected
 * wallet. The first pin ever also registers the schema, one transaction
 * more. Each call is tried first on the public RPC, so a refusal shows,
 * with EAS's own name for it, before the wallet opens.
 */
export async function pinSlug(eas: Eas, slug: string): Promise<Hex> {
  const chain = reader(eas.rpc)
  const wallet = await signer()
  const registry = eas.schemaRegistry as Address
  const known = await chain.readContract({
    address: registry,
    abi: RegistryAbi,
    functionName: "getSchema",
    args: [
      eas.schema as Hex,
    ],
  })

  if (known.uid === zeroHash) {
    const { request } = await chain.simulateContract({
      address: registry,
      abi: RegistryAbi,
      functionName: "register",
      args: [
        eas.schemaText,
        zeroAddress,
        true,
      ],
      account: wallet.account,
    })

    await landed(chain, await writeContract(wallet, request))
  }

  const { request } = await chain.simulateContract({
    address: eas.address as Address,
    abi: EasAbi,
    functionName: "attest",
    args: [
      {
        schema: eas.schema as Hex,
        data: {
          recipient: zeroAddress,
          expirationTime: 0n,
          revocable: true,
          refUID: zeroHash,
          data: encodeAbiParameters(
            [
              {
                type: "string",
              },
            ],
            [
              slug,
            ],
          ),
          value: 0n,
        },
      },
    ],
    account: wallet.account,
  })
  const receipt = await landed(chain, await writeContract(wallet, request))
  const [attested] = parseEventLogs({
    abi: EasAbi,
    eventName: "Attested",
    logs: receipt.logs,
  })

  if (!attested) {
    throw new Error("The attestation left no trace in the receipt.")
  }

  return attested.args.uid
}

/** Takes a pin off: revokes its attestation, which only its attester can. */
export async function unpinSlug(eas: Eas, uid: string): Promise<Hash> {
  const chain = reader(eas.rpc)
  const wallet = await signer()
  const { request } = await chain.simulateContract({
    address: eas.address as Address,
    abi: EasAbi,
    functionName: "revoke",
    args: [
      {
        schema: eas.schema as Hex,
        data: {
          uid: uid as Hex,
          value: 0n,
        },
      },
    ],
    account: wallet.account,
  })
  const hash = await writeContract(wallet, request)

  await landed(chain, hash)

  return hash
}

export async function disconnectWallet(): Promise<void> {
  try {
    await disconnect(config)
  } catch {
    // A wallet that is already gone has nothing to disconnect.
  }

  // Coinbase's SDK keeps its session until told, as wagmi's own connector tells it.
  const provider = coinbase ? await coinbase.catch(() => null) : null

  await (provider as {
    disconnect?: () => Promise<void>
  } | null)
    ?.disconnect?.()
}
