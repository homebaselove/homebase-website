/**
 * Finds a wallet without a wallet library: the Farcaster host's provider
 * inside a mini app, whatever wallets announce themselves on the page, or the
 * one injected at window.ethereum.
 */
export interface Provider {
  request(args: {
    method: string
    params?: unknown[]
  }): Promise<unknown>
}

interface Announcement {
  info: {
    name: string
    rdns?: string
  }
  provider: Provider
}

declare global {
  interface Window {
    ethereum?: Provider
  }
}

/** How long wallets get to answer the page's request to announce themselves. */
const AnnounceWaitMs = 250

async function fromMiniApp(): Promise<Provider | null> {
  try {
    const { sdk } = await import("@farcaster/frame-sdk")

    if (!(await sdk.isInMiniApp())) {
      return null
    }

    return (await sdk.wallet.getEthereumProvider()) ?? null
  } catch {
    return null
  }
}

function announced(): Promise<Announcement[]> {
  return new Promise((resolve) => {
    const found: Announcement[] = []
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<Announcement>).detail

      if (
        detail?.provider && !found.some((a) => a.provider === detail.provider)
      ) {
        found.push(detail)
      }
    }

    window.addEventListener("eip6963:announceProvider", listener)
    window.dispatchEvent(new Event("eip6963:requestProvider"))
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", listener)
      resolve(found)
    }, AnnounceWaitMs)
  })
}

export async function findProvider(): Promise<Provider | null> {
  const hosted = await fromMiniApp()

  if (hosted) {
    return hosted
  }

  const wallets = await announced()
  const preferred =
    wallets.find((wallet) => wallet.info.rdns === "com.coinbase.wallet")
      ?? wallets[0]

  return preferred?.provider ?? window.ethereum ?? null
}

export class WalletError extends Error {}

const rejected = (error: unknown) =>
  typeof error === "object" && error !== null && (error as {
      code?: number
    })
      .code === 4001

export async function requestAccount(provider: Provider): Promise<string> {
  let accounts: unknown

  try {
    accounts = await provider.request({
      method: "eth_requestAccounts",
    })
  } catch (error) {
    throw new WalletError(
      rejected(error)
        ? "You closed the wallet before connecting."
        : "The wallet didn't connect.",
    )
  }

  const account = Array.isArray(accounts) ? accounts[0] : null

  if (typeof account !== "string") {
    throw new WalletError("The wallet shared no account.")
  }

  return account
}

const toHex = (text: string) =>
  `0x${
    Array
      .from(
        new TextEncoder().encode(text),
        (byte) => byte.toString(16).padStart(2, "0"),
      )
      .join("")
  }`

export async function personalSign(
  provider: Provider,
  message: string,
  address: string,
): Promise<string> {
  let signature: unknown

  try {
    signature = await provider.request({
      method: "personal_sign",
      params: [
        toHex(message),
        address,
      ],
    })
  } catch (error) {
    throw new WalletError(
      rejected(error)
        ? "You didn't sign the message."
        : "The wallet didn't sign the message.",
    )
  }

  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new WalletError("The wallet returned no signature.")
  }

  return signature
}
