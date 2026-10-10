/**
 * The browser's view of the map: the pins and the calls that change them.
 * The server reads the pins, attestations on Base, and looks them up on
 * Luma; adding one is an attestation the connected wallet sends, removing
 * one a revocation. The wallet itself is the page's, in src/wallet/client.ts.
 */
import { signal } from "preact/signals"
import { call, freshPath, markChanged } from "../call.ts"
import {
  account,
  admins,
  type Failure,
  isFailure,
  type Progress,
  transact,
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

export async function loadEvents(): Promise<void> {
  const answer = await call<{
    events: MapEvent[]
    eas: Eas
    admins: string[]
  }>(freshPath("/map.json", ChangedKey, FreshForMs))

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

/** The events being pinned now, so the same one is not sent twice at once. */
const pinning = new Set<string>()

/** Pins an event the preview showed: an attestation from the connected wallet. */
export async function pin(
  event: LumaEvent,
  progress?: Progress,
): Promise<MapEvent | Failure> {
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

  if (pinning.has(event.slug)) {
    return {
      error: "That event is already being pinned.",
      status: 409,
    }
  }

  pinning.add(event.slug)

  const uid = await transact(
    "pin",
    (lib, told) => lib.attestString(where, event.slug, told),
    progress,
  )
    .finally(() => pinning.delete(event.slug))

  if (isFailure(uid)) {
    return uid
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
  markChanged(ChangedKey)

  return pinned
}

export async function unpin(
  slug: string,
  progress?: Progress,
): Promise<Failure | null> {
  const where = eas.value
  const pinned = (events.value ?? []).find((event) => event.slug === slug)

  if (!account.value || !where || !pinned) {
    return {
      error: "Connect a wallet that may remove events first.",
      status: 401,
    }
  }

  const revoked = await transact(
    "removal",
    (lib, told) => lib.revokeAttestation(where, pinned.uid, told),
    progress,
  )

  if (isFailure(revoked)) {
    return revoked
  }

  events.value = (events.value ?? []).filter((event) => event.slug !== slug)
  markChanged(ChangedKey)

  return null
}
