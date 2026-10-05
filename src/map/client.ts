/**
 * The browser's view of the map: the pins, who is signed in, and the calls
 * that change either. Sessions ride in a bearer token rather than a cookie,
 * which also works inside the Farcaster mini app's frame. The wallet code
 * is fetched on its own the first time someone presses Connect.
 */
import { signal } from "preact/signals"
import type { EIP1193Provider } from "viem"
import type { Wallet } from "../wallet/wagmi.ts"
import type { Source } from "./luma.ts"
import type { LumaEvent, MapEvent } from "./MapEvent.ts"

export type {
  Wallet,
}

export interface Session {
  readonly role:
    | "admin"
    | "locker"
  readonly address: string
  readonly expiresAt: string
}

export interface Failure {
  readonly error: string
  readonly status: number
}

export const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "error" in value

const TokenKey = "homebase.map.token"

function storedToken(): string | null {
  try {
    return localStorage.getItem(TokenKey)
  } catch {
    return null
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TokenKey, token)
    } else {
      localStorage.removeItem(TokenKey)
    }
  } catch {
    // Private windows may refuse; the session then lasts the page.
  }
}

export const events = signal<MapEvent[] | null>(null)

export const loadFailed = signal(false)

export const token = signal<string | null>(storedToken())

export const session = signal<Session | null>(null)

async function call<A>(
  path: string,
  init: RequestInit = {},
): Promise<A | Failure> {
  const headers: Record<string, string> = {
    ...(init.body
      ? {
        "content-type": "application/json",
      }
      : {}),
    ...(token.value
      ? {
        authorization: `Bearer ${token.value}`,
      }
      : {}),
  }

  try {
    const response = await fetch(path, {
      ...init,
      headers,
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
  const answer = await call<{
    events: MapEvent[]
  }>("/map.json")

  if (isFailure(answer)) {
    loadFailed.value = true
    events.value ??= []
  } else {
    loadFailed.value = false
    events.value = answer.events
  }
}

/** Learns who the stored token is. */
export async function checkSession(): Promise<Failure | null> {
  const answer = await call<{
    actor: Session | null
  }>("/auth/session.json")

  if (isFailure(answer)) {
    return answer
  }

  session.value = answer.actor

  if (!answer.actor && token.value) {
    token.value = null
    storeToken(null)
  }

  return null
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

/**
 * Connects the chosen wallet, has it sign the message the server wrote for
 * its address, and opens a session with the signature.
 */
export async function signInWith(walletId: string): Promise<Failure | null> {
  let lib: WalletModule

  try {
    lib = await walletModule()
  } catch {
    return NotLoaded
  }

  let address: string

  try {
    address = await lib.connectWallet(walletId)
  } catch (error) {
    return {
      error: rejected(error)
        ? "You closed the wallet before connecting."
        : "The wallet didn't connect. Try again, or try another wallet.",
      status: 0,
    }
  }

  const issued = await call<{
    message: string
  }>("/auth/nonce.json", {
    method: "POST",
    body: JSON.stringify({
      address,
    }),
  })

  if (isFailure(issued)) {
    return issued
  }

  let signature: string

  try {
    signature = await lib.signInMessage(issued.message)
  } catch (error) {
    return {
      error: rejected(error)
        ? "You didn't sign the message."
        : "The wallet didn't sign the message.",
      status: 0,
    }
  }

  const verified = await call<
    Session & {
      token: string
    }
  >("/auth/verify.json", {
    method: "POST",
    body: JSON.stringify({
      message: issued.message,
      signature,
    }),
  })

  if (isFailure(verified)) {
    return verified
  }

  token.value = verified.token
  storeToken(verified.token)
  session.value = {
    role: verified.role,
    address: verified.address,
    expiresAt: verified.expiresAt,
  }

  return null
}

export async function signOut(): Promise<void> {
  if (session.value) {
    await call("/auth/session.json", {
      method: "DELETE",
    })
  }

  token.value = null
  session.value = null
  storeToken(null)

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

export async function pin(url: string): Promise<MapEvent | Failure> {
  const answer = await call<{
    event: MapEvent
  }>("/map.json", {
    method: "POST",
    body: JSON.stringify({
      url,
    }),
  })

  if (isFailure(answer)) {
    return answer
  }

  events.value = [
    ...(events.value ?? []).filter((event) => event.slug !== answer.event.slug),
    answer.event,
  ]

  return answer.event
}

export async function unpin(slug: string): Promise<Failure | null> {
  const answer = await call(`/map.json?slug=${encodeURIComponent(slug)}`, {
    method: "DELETE",
  })

  if (isFailure(answer)) {
    return answer
  }

  events.value = (events.value ?? []).filter((event) => event.slug !== slug)

  return null
}
