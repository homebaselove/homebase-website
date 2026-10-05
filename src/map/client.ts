/**
 * The browser's view of the map: the pins, who is signed in, and the calls
 * that change either. Sessions ride in a bearer token rather than a cookie,
 * which also works inside the Farcaster mini app's frame.
 */
import { signal } from "preact/signals"
import {
  findProvider,
  personalSign,
  requestAccount,
  WalletError,
} from "../wallet/provider.ts"
import type { Source } from "./luma.ts"
import type { LumaEvent, MapEvent } from "./MapEvent.ts"

export interface Session {
  readonly role:
    | "admin"
    | "locker"
  readonly address: string | null
  readonly via:
    | "key"
    | "wallet"
  readonly expiresAt: string | null
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

/** Whether the server lets wallets sign in at all. */
export const walletSignIn = signal(false)

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

/** Learns who the stored token is, and whether wallets may sign in at all. */
export async function checkSession(): Promise<Failure | null> {
  const answer = await call<{
    actor: Session | null
    walletSignIn: boolean
  }>("/auth/session.json")

  if (isFailure(answer)) {
    return answer
  }

  walletSignIn.value = answer.walletSignIn
  session.value = answer.actor

  if (!answer.actor && token.value) {
    token.value = null
    storeToken(null)
  }

  return null
}

/** Tries the admin key; a wrong one is dropped again, a failed check is said as such. */
export async function useAdminKey(key: string): Promise<Failure | null> {
  token.value = key.trim()

  const failure = await checkSession()

  if (failure) {
    token.value = null

    return failure
  }

  if (session.value) {
    storeToken(token.value)

    return null
  }

  token.value = null

  return {
    error: "That key isn't the admin key.",
    status: 401,
  }
}

export async function signInWithWallet(): Promise<Failure | null> {
  try {
    const provider = await findProvider()

    if (!provider) {
      return {
        error: "No wallet was found in this browser.",
        status: 0,
      }
    }

    const address = await requestAccount(provider)
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

    const signature = await personalSign(provider, issued.message, address)
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
      via: verified.via,
      expiresAt: verified.expiresAt,
    }

    return null
  } catch (error) {
    return {
      error: error instanceof WalletError
        ? error.message
        : "The wallet didn't go through with the sign-in.",
      status: 0,
    }
  }
}

export async function signOut(): Promise<void> {
  if (session.value?.via === "wallet") {
    await call("/auth/session.json", {
      method: "DELETE",
    })
  }

  token.value = null
  session.value = null
  storeToken(null)
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
