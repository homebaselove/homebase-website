/**
 * Wallets, through wagmi core. The map page loads none of this until someone
 * presses Connect, when the browser fetches it as its own bundle.
 *
 * Every wallet reaches wagmi as an EIP-1193 provider behind its injected
 * connector: the wallets that announce themselves on the page (EIP-6963),
 * the host's wallet inside a Farcaster mini app, which the page hands in
 * since its SDK is already there, and Coinbase's smart wallet through its
 * SDK, which opens a passkey flow for people with no extension at all.
 */
import {
  connect,
  createConfig,
  disconnect,
  getAccount,
  http,
  injected,
  signMessage,
} from "@wagmi/core"
import { base } from "@wagmi/core/chains"
import type { EIP1193Provider } from "viem"

export interface Wallet {
  readonly id: string
  readonly name: string
  /** A data: URI the wallet announced, or nothing for the ones added here. */
  readonly icon: string | null
}

const CoinbaseId = "coinbase-smart-wallet"

const HostId = "host"

const BrowserId = "browser"

/** How long wallets get to answer the page's request to announce themselves. */
const AnnounceWaitMs = 150

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
 * Connects the chosen wallet and hands back the account to sign in with. A
 * wallet that is still connected from an earlier try, which the server may
 * have turned away, is reused rather than asked again. The wallet is not
 * asked to switch chains: a sign-in is a signature, good from any chain, and
 * a switch some wallets only answer on the phone would leave the page
 * waiting.
 */
export async function connectWallet(id: string): Promise<string> {
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

/** A personal_sign of the message by the connected wallet. */
export function signInMessage(message: string): Promise<string> {
  return signMessage(config, {
    message,
  })
}

export async function disconnectWallet(): Promise<void> {
  try {
    await disconnect(config)
  } catch {
    // A wallet that is already gone has nothing to disconnect.
  }
}
