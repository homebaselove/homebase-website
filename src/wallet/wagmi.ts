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
    found.push({
      id: CoinbaseId,
      name: "Coinbase Wallet",
      icon: null,
    })
  }

  return found
}

async function coinbaseProvider(): Promise<EIP1193Provider> {
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
}

async function connectorFor(id: string) {
  if (id === HostId) {
    if (!hosted) {
      throw new Error("The host's wallet is only there inside its app.")
    }

    return injected({
      target: {
        id,
        name: "Wallet in this app",
        provider: hosted,
      },
    })
  }

  if (id === CoinbaseId) {
    return injected({
      target: {
        id,
        name: "Coinbase Wallet",
        provider: await coinbaseProvider(),
      },
    })
  }

  if (id === BrowserId) {
    return injected()
  }

  const announced = config.connectors.find((connector) => connector.id === id)

  if (!announced) {
    throw new Error("That wallet is no longer on the page.")
  }

  return announced
}

/** Connects the chosen wallet on Base and hands back the account to sign in with. */
export async function connectWallet(id: string): Promise<string> {
  const connector = await connectorFor(id)
  const connected = await connect(config, {
    connector,
    chainId: base.id,
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
