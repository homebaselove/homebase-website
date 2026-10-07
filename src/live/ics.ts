/**
 * An iCalendar feed, read into the events Homebase Live lists: the next
 * occurrences of each event, repeats expanded, exceptions honoured, with
 * the link each carries. Luma puts the event page in the URL field and the
 * stream or venue in LOCATION; Google and Outlook feeds carry a URL when
 * the event has one.
 */
import ICAL from "ical.js"

export interface LiveEvent {
  /** Unique across the feed, and across occurrences of one repeating event. */
  readonly id: string
  readonly title: string
  readonly description: string | null
  /** Where to go: the event's own link, or the stream or venue when that is a link. */
  readonly link: string | null
  readonly start: string
  readonly end: string
  readonly allDay: boolean
}

export interface Feed {
  readonly name: string | null
  readonly events: LiveEvent[]
}

export interface Window {
  readonly now: Date
  /** How far ahead occurrences are listed, in days. */
  readonly horizonDays?: number
  /** At most this many events for the feed. */
  readonly limit?: number
}

const DayMs = 24 * 60 * 60_000

const DescriptionLimit = 2000

const Link = /https?:\/\/[^\s<>"']+/i

export class FeedError extends Error {}

const asLink = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const found = value.trim().match(Link)

  return found ? found[0] : null
}

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

/** Reads a feed. Throws FeedError when the text is not a calendar. */
export function parseFeed(text: string, window: Window): Feed {
  let calendar: ICAL.Component

  try {
    calendar = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new FeedError("That link didn't give back a calendar.")
  }

  if (calendar.name !== "vcalendar") {
    throw new FeedError("That link didn't give back a calendar.")
  }

  const now = window.now.getTime()
  const horizon = now + (window.horizonDays ?? 120) * DayMs
  const limit = window.limit ?? 60
  const components = calendar.getAllSubcomponents("vevent")
  const masters = new Map<string, ICAL.Component>()
  const exceptions = new Map<string, ICAL.Component[]>()

  for (const component of components) {
    const uid = asText(component.getFirstPropertyValue("uid"))
      ?? `anonymous-${masters.size + exceptions.size}`

    if (component.hasProperty("recurrence-id")) {
      exceptions.set(uid, [
        ...(exceptions.get(uid) ?? []),
        component,
      ])
    } else {
      masters.set(uid, component)
    }
  }

  const events: LiveEvent[] = []

  const keep = (
    component: ICAL.Component,
    uid: string,
    start: Date,
    end: Date,
    allDay: boolean,
    occurrence: boolean,
  ) => {
    if (end.getTime() < now || start.getTime() > horizon) {
      return
    }

    const title = asText(component.getFirstPropertyValue("summary"))
      ?? "Untitled"
    const description = asText(component.getFirstPropertyValue("description"))
    const link = asLink(component.getFirstPropertyValue("url"))
      ?? asLink(component.getFirstPropertyValue("location"))
      ?? asLink(description)

    events.push({
      id: occurrence ? `${uid}@${start.toISOString()}` : uid,
      title,
      description: description ? description.slice(0, DescriptionLimit) : null,
      link,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
    })
  }

  for (const [uid, master] of masters) {
    const event = new ICAL.Event(master, {
      exceptions: exceptions.get(uid) ?? [],
    })

    if (!event.isRecurring()) {
      keep(
        master,
        uid,
        event.startDate.toJSDate(),
        event.endDate.toJSDate(),
        event.startDate.isDate,
        false,
      )

      continue
    }

    const iterator = event.iterator()

    for (
      let next = iterator.next(), seen = 0;
      next && seen < limit;
      next = iterator.next(), seen += 1
    ) {
      const details = event.getOccurrenceDetails(next)
      const start = details.startDate.toJSDate()

      if (start.getTime() > horizon) {
        break
      }

      keep(
        details.item.component,
        uid,
        start,
        details.endDate.toJSDate(),
        details.startDate.isDate,
        true,
      )
    }
  }

  // An exception whose master the feed left out stands on its own.
  for (const [uid, orphans] of exceptions) {
    if (masters.has(uid)) {
      continue
    }

    for (const orphan of orphans) {
      const event = new ICAL.Event(orphan)

      keep(
        orphan,
        uid,
        event.startDate.toJSDate(),
        event.endDate.toJSDate(),
        event.startDate.isDate,
        true,
      )
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start))

  return {
    name: asText(calendar.getFirstPropertyValue("x-wr-calname")),
    events: events.slice(0, limit),
  }
}
