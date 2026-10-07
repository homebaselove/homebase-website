/**
 * The browser's view of Homebase Live: the calendars, the events ahead on
 * them, and the calls that change the calendars. Adding one is an
 * attestation the connected wallet sends under Live's own schema, removing
 * one a revocation; the server reads the feeds.
 */
import { signal } from "preact/signals"
import { call } from "../map/client.ts"
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
import type { Calendar, ListedEvent } from "./api.ts"
import type { LiveEvent } from "./ics.ts"

export type {
  Calendar,
  ListedEvent,
  LiveEvent,
}

/** When this browser last changed the calendars, so it reads past the cache for a while after. */
const ChangedKey = "homebase.live.changed"

const FreshForMs = 6 * 60_000

export const calendars = signal<Calendar[] | null>(null)

export const liveEvents = signal<ListedEvent[]>([])

export const liveFailed = signal(false)

/** Where calendars are attested, as the server told the page; null until the list has loaded. */
export const liveEas = signal<Eas | null>(null)

export async function loadLive(): Promise<void> {
  const changed = Number(stored(ChangedKey) ?? 0)
  const answer = await call<{
    calendars: Calendar[]
    events: ListedEvent[]
    eas: Eas
    admins: string[]
  }>(
    Date.now() - changed < FreshForMs
      ? `/live.json?fresh=${changed}`
      : "/live.json",
  )

  if (isFailure(answer)) {
    liveFailed.value = true
    calendars.value ??= []
  } else {
    liveFailed.value = false
    calendars.value = answer.calendars
    liveEvents.value = answer.events
    liveEas.value = answer.eas
    admins.value = answer.admins
  }
}

export interface CalendarPreview {
  readonly url: string
  readonly name: string | null
  readonly events: LiveEvent[]
  readonly upcoming: number
}

export async function previewCalendar(
  url: string,
): Promise<CalendarPreview | Failure> {
  const answer = await call<{
    calendar: CalendarPreview
  }>("/live/preview.json", {
    method: "POST",
    body: JSON.stringify({
      url,
    }),
  })

  return isFailure(answer) ? answer : answer.calendar
}

/** Adds a calendar the preview showed: an attestation from the connected wallet. */
export async function addCalendar(
  found: CalendarPreview,
): Promise<Calendar | Failure> {
  const me = account.value
  const where = liveEas.value

  if (!me || !where) {
    return {
      error: "Connect a wallet that may add calendars first.",
      status: 401,
    }
  }

  if ((calendars.value ?? []).some((known) => known.url === found.url)) {
    return {
      error: "That calendar is already on Homebase Live.",
      status: 409,
    }
  }

  let uid: string

  try {
    uid = await (await walletModule()).attestString(where, found.url)
  } catch (error) {
    return sendFailure(error, "calendar")
  }

  const added: Calendar = {
    uid,
    url: found.url,
    name: found.name,
    addedBy: me.address,
    addedAt: new Date().toISOString(),
    reachable: true,
    events: found.upcoming,
  }

  calendars.value = [
    ...(calendars.value ?? []),
    added,
  ]
  liveEvents.value = [
    ...liveEvents.value,
    ...found.events.map((event) => ({
      ...event,
      calendar: uid,
    })),
  ]
    .sort((a, b) => a.start.localeCompare(b.start))
  store(ChangedKey, String(Date.now()))

  return added
}

export async function removeCalendar(uid: string): Promise<Failure | null> {
  const where = liveEas.value

  if (!account.value || !where) {
    return {
      error: "Connect a wallet that may remove calendars first.",
      status: 401,
    }
  }

  try {
    await (await walletModule()).revokeAttestation(where, uid)
  } catch (error) {
    return sendFailure(error, "removal")
  }

  calendars.value = (calendars.value ?? []).filter((known) => known.uid !== uid)
  liveEvents.value = liveEvents.value.filter((event) => event.calendar !== uid)
  store(ChangedKey, String(Date.now()))

  return null
}
