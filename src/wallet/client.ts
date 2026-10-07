/**
 * The page's wallet: one connection shared by the map, Homebase Live and
 * the funding card. Any wallet may connect; what it may do follows from
 * whether it is one of the admins the server names with each list. The
 * wallet code itself is fetched on its own the first time it is needed.
 */
import { computed, signal } from "preact/signals"
import type { Address, EIP1193Provider, Hash } from "viem"
import type { Wallet } from "./wagmi.ts"

export type {
  Wallet,
}

/** The connected wallet. */
export interface Account {
  readonly address: string
}

export interface Failure {
  readonly error: string
  readonly status: number
}

export const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "error" in value

/** The wallet connected last, so a reload picks it back up. */
const WalletKey = "homebase.wallet"

/** Where the first version kept it. */
const OldWalletKey = "homebase.map.wallet"

export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function store(key: string, value: string | null) {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // Private windows may refuse; the page then forgets on reload.
  }
}

export const account = signal<Account | null>(null)

/** The wallets whose attestations count, as the server tells the page. */
export const admins = signal<readonly string[]>([])

/** Whether the connected wallet is one of the admins. */
export const isAdmin = computed(() => {
  const mine = account.value?.address.toLowerCase()

  return mine !== undefined
    && admins.value.some((admin) => admin.toLowerCase() === mine)
})

export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

type WalletModule = typeof import("./wagmi.ts")

/**
 * Where the wallet bundle is served from. It is built apart from the page,
 * so the address is a value here rather than an import the bundler would
 * fold into the page.
 */
const WalletUrl = "/wallet/wagmi.js"

let wallet: Promise<WalletModule> | null = null

/** The wallet bundle, fetched once, the first time it is needed. */
export function walletModule(): Promise<WalletModule> {
  wallet ??= import(WalletUrl) as Promise<WalletModule>
  wallet.catch(() => {
    wallet = null
  })

  return wallet
}

const NotLoaded: Failure = {
  error:
    "The wallet code couldn't be loaded. Check your connection and try again.",
  status: 0,
}

let hosting: Promise<EIP1193Provider | null> | null = null

/**
 * The wallet of the app hosting the page, inside a Farcaster mini app; the
 * page already carries that SDK for its ready call. Nothing anywhere else.
 */
function hostedWallet(): Promise<EIP1193Provider | null> {
  hosting ??= (async () => {
    try {
      const { sdk } = await import("@farcaster/frame-sdk")

      if (!(await sdk.isInMiniApp())) {
        return null
      }

      return (await sdk.wallet.getEthereumProvider()) as
        | EIP1193Provider
        | undefined ?? null
    } catch {
      return null
    }
  })()

  return hosting
}

/** The wallets this browser can offer. */
export async function walletChoices(): Promise<Wallet[] | Failure> {
  try {
    const [lib, host] = await Promise.all([
      walletModule(),
      hostedWallet(),
    ])

    return await lib.wallets(host)
  } catch (error) {
    console.error("The wallet code did not load:", error)

    return NotLoaded
  }
}

/**
 * What the wallet or the chain said went wrong, for the message: a contract
 * error by name, else the revert's signature or reason, else the first line
 * of the message.
 */
export function reason(error: unknown): string {
  for (
    let seen = error as Record<string, unknown> | null;
    seen;
    seen = seen.cause as Record<string, unknown> | null
  ) {
    const data = seen.data as {
      errorName?: string
    } | undefined
    const named = data?.errorName
      ?? seen.errorName
      ?? seen.signature
      ?? seen.reason

    if (typeof named === "string" && named) {
      return `: ${named}`
    }
  }

  const seen = error as {
    shortMessage?: string
    message?: string
  } | null
  const text = (seen?.shortMessage ?? seen?.message ?? String())
    .split("\n")[0]
    .trim()
    .replace(/\.$/, String())

  return text ? `: ${text.slice(0, 160)}` : String()
}

/** A wallet's "no" is error code 4001, which viem wraps for the caller. */
export function rejected(error: unknown): boolean {
  const seen = error as {
    code?: number
    name?: string
    cause?: unknown
  } | null

  return !!seen && (
    seen.code === 4001
    || seen.name === "UserRejectedRequestError"
    || rejected(seen.cause)
  )
}

/** What a transaction that did not land reads as. */
export function sendFailure(error: unknown, what: string): Failure {
  console.error(`The ${what} did not go through:`, error)

  return {
    error: rejected(error)
      ? "You didn't approve the transaction."
      : `The ${what} didn't go through${reason(error)}.`,
    status: 0,
  }
}

/** Connects the chosen wallet. */
export async function connectWith(walletId: string): Promise<Failure | null> {
  let lib: WalletModule

  try {
    lib = await walletModule()
  } catch {
    return NotLoaded
  }

  let address: Address

  try {
    address = await lib.connectWallet(walletId)
  } catch (error) {
    console.error("The wallet did not connect:", error)

    return {
      error: rejected(error)
        ? "You closed the wallet before connecting."
        : `The wallet didn't connect${
          reason(error)
        }. Try again, or try another wallet.`,
      status: 0,
    }
  }

  account.value = {
    address,
  }
  store(WalletKey, walletId)
  store(OldWalletKey, null)

  return null
}

let restoring: Promise<void> | null = null

/** Picks the last wallet back up after a reload, without a prompt, when there was one. */
export function restore(): Promise<void> {
  restoring ??= (async () => {
    const walletId = stored(WalletKey) ?? stored(OldWalletKey)

    if (!walletId) {
      return
    }

    try {
      const lib = await walletModule()
      const address = await lib.reconnectWallet(walletId)

      if (!address) {
        store(WalletKey, null)
        store(OldWalletKey, null)

        return
      }

      account.value = {
        address,
      }
    } catch (error) {
      console.error("The wallet could not be picked back up:", error)
    }
  })()

  return restoring
}

export async function signOut(): Promise<void> {
  account.value = null
  store(WalletKey, null)
  store(OldWalletKey, null)

  if (wallet) {
    await (await wallet).disconnectWallet()
  }
}

/**
 * Sends ether from the connected wallet, and waits for it to land. The
 * amount is text, as typed, so nothing is rounded before the wallet sees it.
 */
export async function sendEther(
  rpc: string,
  to: string,
  amountEth: string,
): Promise<Hash | Failure> {
  if (!account.value) {
    return {
      error: "Connect a wallet first.",
      status: 401,
    }
  }

  try {
    return await (await walletModule()).sendEth(rpc, to as Address, amountEth)
  } catch (error) {
    return sendFailure(error, "donation")
  }
}
