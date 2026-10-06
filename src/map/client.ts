/**
 * The browser's view of the map: the pins, the connected wallet, and the
 * calls that change either. The server reads the pins, attestations on
 * Base, and looks them up on Luma; adding one is an attestation the
 * connected wallet sends, removing one a revocation. The wallet code is
 * fetched on its own the first time it is needed.
 */
import { signal } from "preact/signals"
import type { Address, EIP1193Provider } from "viem"
import type { Eas, Wallet } from "../wallet/wagmi.ts"
import type { Source } from "./luma.ts"
import type { LumaEvent, MapEvent } from "./MapEvent.ts"

export type {
  Eas,
  Wallet,
}

/** The connected wallet, once it is one the map lets in. */
export interface Account {
  readonly address: string
  readonly isAdmin: boolean
}

export interface Failure {
  readonly error: string
  readonly status: number
}

export const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "error" in value

/** The wallet connected last, so a reload picks it back up. */
const WalletKey = "homebase.map.wallet"

/** When this browser last changed the map, so it reads past the cache for a while after. */
const ChangedKey = "homebase.map.changed"

const FreshForMs = 2 * 60_000

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string | null) {
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

export const events = signal<MapEvent[] | null>(null)

export const loadFailed = signal(false)

/** Where pins are attested, as the server told the page; null until the list has loaded. */
export const eas = signal<Eas | null>(null)

/** The wallets whose pins count, as the server told the page. */
export const admins = signal<readonly string[]>([])

export const account = signal<Account | null>(null)

async function call<A>(
  path: string,
  init: RequestInit = {},
): Promise<A | Failure> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: init.body
        ? {
          "content-type": "application/json",
        }
        : {},
      // Past the server's own worst case: a slow page and slow endpoints.
      signal: AbortSignal.timeout?.(30_000),
    })
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        error: typeof body.error === "string"
          ? body.error
          : "Something went wrong. Try again.",
        status: response.status,
      }
    }

    return body as A
  } catch {
    return {
      error: "The site didn't answer. Check your connection and try again.",
      status: 0,
    }
  }
}

export async function loadEvents(): Promise<void> {
  const changed = Number(stored(ChangedKey) ?? 0)
  const answer = await call<{
    events: MapEvent[]
    eas: Eas
    admins: string[]
  }>(
    Date.now() - changed < FreshForMs
      ? `/map.json?fresh=${changed}`
      : "/map.json",
  )

  if (isFailure(answer)) {
    loadFailed.value = true
    events.value ??= []
  } else {
    loadFailed.value = false
    events.value = answer.events
    eas.value = answer.eas
    admins.value = answer.admins
  }
}

type WalletModule = typeof import("../wallet/wagmi.ts")

/**
 * Where the wallet bundle is served from. It is built apart from the page,
 * so the address is a value here rather than an import the bundler would
 * fold into the page.
 */
const WalletUrl = "/wallet/wagmi.js"

let wallet: Promise<WalletModule> | null = null

/** The wallet bundle, fetched once, the first time it is needed. */
function walletModule(): Promise<WalletModule> {
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
 * error by name, else the first line of the message.
 */
function reason(error: unknown): string {
  for (
    let seen = error as Record<string, unknown> | null;
    seen;
    seen = seen.cause as Record<string, unknown> | null
  ) {
    const data = seen.data as {
      errorName?: string
    } | undefined

    if (data?.errorName) {
      return `: ${data.errorName}`
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
function rejected(error: unknown): boolean {
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

const NotAllowed: Failure = {
  error:
    "This wallet can't add events yet. The Homebase wallet can now, and $home lockers will be able to soon.",
  status: 403,
}

/** What the map makes of a connected wallet: in, when it is one whose pins count. */
function standing(address: Address): Account | Failure {
  const mine = address.toLowerCase()

  return admins.value.some((admin) => admin.toLowerCase() === mine)
    ? {
      address,
      isAdmin: true,
    }
    : NotAllowed
}

/** Connects the chosen wallet and checks it is one the map lets in. */
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

  const found = standing(address)

  if (isFailure(found)) {
    return found
  }

  account.value = found
  store(WalletKey, walletId)

  return null
}

/** Picks the last wallet back up after a reload, without a prompt, when there was one. */
export async function restore(): Promise<void> {
  const walletId = stored(WalletKey)

  if (!walletId) {
    return
  }

  try {
    const lib = await walletModule()
    const address = await lib.reconnectWallet(walletId)

    if (!address) {
      store(WalletKey, null)

      return
    }

    const found = standing(address)

    if (!isFailure(found)) {
      account.value = found
    }
  } catch (error) {
    console.error("The wallet could not be picked back up:", error)
  }
}

export async function signOut(): Promise<void> {
  account.value = null
  store(WalletKey, null)

  if (wallet) {
    await (await wallet).disconnectWallet()
  }
}

export interface Preview {
  readonly event: LumaEvent
  readonly source: Source
}

export function preview(url: string): Promise<Preview | Failure> {
  return call<Preview>("/map/preview.json", {
    method: "POST",
    body: JSON.stringify({
      url,
    }),
  })
}

function sendFailure(error: unknown, what: string): Failure {
  console.error(`The ${what} did not go through:`, error)

  return {
    error: rejected(error)
      ? "You didn't approve the transaction."
      : `The ${what} didn't go through${reason(error)}.`,
    status: 0,
  }
}

/** Pins an event the preview showed: an attestation from the connected wallet. */
export async function pin(event: LumaEvent): Promise<MapEvent | Failure> {
  const me = account.value
  const where = eas.value

  if (!me || !where) {
    return {
      error: "Connect a wallet that may add events first.",
      status: 401,
    }
  }

  if ((events.value ?? []).some((pinned) => pinned.slug === event.slug)) {
    return {
      error: "That event is already on the map.",
      status: 409,
    }
  }

  let uid: string

  try {
    uid = await (await walletModule()).pinSlug(where, event.slug)
  } catch (error) {
    return sendFailure(error, "pin")
  }

  const pinned: MapEvent = {
    ...event,
    uid,
    addedBy: me.address,
    addedAt: new Date().toISOString(),
  }

  events.value = [
    ...(events.value ?? []).filter((other) => other.slug !== event.slug),
    pinned,
  ]
  store(ChangedKey, String(Date.now()))

  return pinned
}

export async function unpin(slug: string): Promise<Failure | null> {
  const where = eas.value
  const pinned = (events.value ?? []).find((event) => event.slug === slug)

  if (!account.value || !where || !pinned) {
    return {
      error: "Connect a wallet that may remove events first.",
      status: 401,
    }
  }

  try {
    await (await walletModule()).unpinSlug(where, pinned.uid)
  } catch (error) {
    return sendFailure(error, "removal")
  }

  events.value = (events.value ?? []).filter((event) => event.slug !== slug)
  store(ChangedKey, String(Date.now()))

  return null
}
