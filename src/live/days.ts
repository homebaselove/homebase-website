/**
 * How Homebase Live reads time: the day an event falls on in a zone, what a
 * day is called, and the zones a viewer can pick from.
 */
import type { LiveEvent } from "./ics.ts"

export interface Zone {
  readonly id: string
  readonly label: string
}

/** The day an event falls on in a zone; an all-day event keeps its own date in every zone. */
export const dayOf = (
  event: Pick<LiveEvent, "allDay" | "start">,
  timeZone: string,
) =>
  event.allDay
    ? event.start.slice(0, 10)
    : new Date(event.start).toLocaleDateString("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })

export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Kiritimati, Pacific · GMT+14: the city, its region and its offset now. */
export function zoneLabel(id: string, now: Date): string {
  if (id === "UTC") {
    return "UTC"
  }

  const parts = id.split("/")
  const city = parts.at(-1)!.replaceAll("_", " ")
  let offset: string | undefined

  try {
    offset = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")
      ?.value
  } catch {
    // An older browser without offsets names the zone alone.
  }

  return [
    parts.length > 1 ? `${city}, ${parts[0].replaceAll("_", " ")}` : city,
    offset,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Every zone the browser knows, the viewer's own and UTC always among them,
 * by city in alphabetical order, so typing the first letters of a city in
 * the open list lands on it. Browsers leave UTC out of their list.
 */
export function zoneList(
  viewer: string,
  known: readonly string[] = supportedZones(),
  now: Date = new Date(),
): Zone[] {
  return [
    ...new Set([
      viewer,
      "UTC",
      ...known,
    ]),
  ]
    .map((id) => ({
      id,
      label: zoneLabel(id, now),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function supportedZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    // Without the list, the viewer's zone and UTC are still offered.
    return []
  }
}

/** Saturday, October 10, with Today or Tomorrow ahead of it when it is. */
export function dayTitle(
  date: string,
  zone: string,
  now: Date = new Date(),
): string {
  const today = dayOf({
    allDay: false,
    start: now.toISOString(),
  }, zone)
  // The next date on the calendar, counted at noon in UTC, where no clock
  // change can skip or repeat a day.
  const tomorrow = new Date(
    Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60_000,
  )
    .toISOString()
    .slice(0, 10)
  const name = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })

  return date === today
    ? `Today · ${name}`
    : date === tomorrow
    ? `Tomorrow · ${name}`
    : name
}
