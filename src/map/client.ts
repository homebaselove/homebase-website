/**
 * The browser's view of the map: the pins and the calls that change them.
 * The server reads the pins, attestations on Base, and looks them up on
 * Luma; adding one is an attestation the connected wallet sends, removing
 * one a revocation. The wallet itself is the page's, in src/wallet/client.ts.
 */
import { signal } from "preact/signals"
import {
  account,
  admins,
  type Failure,
  isFailure,
  sendFailure,
  store,
  stored,
  walletModule,
} from "../wallet/client.ts"
import type { Eas } from "../wallet/wagmi.ts"
import type { Source } from "./luma.ts"
import type { LumaEvent, MapEvent } from "./MapEvent.ts"

export type {
  Eas,
  Failure,
}

export {
  isFailure,
}

/** When this browser last changed the map, so it reads past the cache for a while after. */
const ChangedKey = "homebase.map.changed"

const FreshForMs = 2 * 60_000

export const events = signal<MapEvent[] | null>(null)

export const loadFailed = signal(false)

/** Where pins are attested, as the server told the page; null until the list has loaded. */
export const eas = signal<Eas | null>(null)

export async function call<A>(
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
    uid = await (await walletModule()).attestString(where, event.slug)
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
    await (await walletModule()).revokeAttestation(where, pinned.uid)
  } catch (error) {
    return sendFailure(error, "removal")
  }

  events.value = (events.value ?? []).filter((event) => event.slug !== slug)
  store(ChangedKey, String(Date.now()))

  return null
}
