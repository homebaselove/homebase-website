/**
 * An iCalendar feed, read into the events Homebase Live lists: the next
 * occurrences of each event, repeats expanded, exceptions honoured, with
 * the link each carries. Luma puts the event page in the URL field and the
 * stream or venue in LOCATION; Google and Outlook feeds carry a URL when
 * the event has one. One event the feed got wrong is left out; it never
 * takes the calendar down with it.
 */
import ICAL from "ical.js"

export interface LiveEvent {
  /** Unique across the feed, and across occurrences of one repeating event. */
  readonly id: string
  readonly title: string
  readonly description: string | null
  /** Where to go: the event's own link, or the stream or venue when that is a link. */
  readonly link: string | null
  /** For an all-day event, midnight UTC on its date. */
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

/**
 * How many occurrences of one repeating event are walked, kept or not. A
 * weekly series started years ago needs its past walked through before its
 * next occurrence; a series repeating by the minute is cut off here instead.
 */
const WalkLimit = 20_000

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

/** A date-only value is midnight UTC on that date, whatever zone the server keeps. */
const toDate = (time: ICAL.Time): Date =>
  time.isDate
    ? new Date(Date.UTC(time.year, time.month - 1, time.day))
    : time.toJSDate()

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

  /** Keeps an occurrence that is ahead and within the horizon; says whether it did. */
  const keep = (
    component: ICAL.Component,
    uid: string,
    start: Date,
    end: Date,
    allDay: boolean,
    occurrence: boolean,
  ): boolean => {
    if (end.getTime() < now || start.getTime() > horizon) {
      return false
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

    return true
  }

  const expand = (uid: string, master: ICAL.Component) => {
    const event = new ICAL.Event(master, {
      exceptions: exceptions.get(uid) ?? [],
    })

    if (!event.isRecurring()) {
      keep(
        master,
        uid,
        toDate(event.startDate),
        toDate(event.endDate),
        event.startDate.isDate,
        false,
      )

      return
    }

    const iterator = event.iterator()
    let kept = 0

    for (let walked = 0; walked < WalkLimit && kept < limit; walked += 1) {
      const next = iterator.next()

      if (!next) {
        break
      }

      const details = event.getOccurrenceDetails(next)
      const start = toDate(details.startDate)

      if (start.getTime() > horizon) {
        break
      }

      if (
        keep(
          details.item.component,
          uid,
          start,
          toDate(details.endDate),
          details.startDate.isDate,
          true,
        )
      ) {
        kept += 1
      }
    }
  }

  for (const [uid, master] of masters) {
    try {
      expand(uid, master)
    } catch (cause) {
      console.error(`An event in the feed could not be read (${uid}):`, cause)
    }
  }

  // An exception whose master the feed left out stands on its own.
  for (const [uid, orphans] of exceptions) {
    if (masters.has(uid)) {
      continue
    }

    for (const orphan of orphans) {
      try {
        const event = new ICAL.Event(orphan)

        keep(
          orphan,
          uid,
          toDate(event.startDate),
          toDate(event.endDate),
          event.startDate.isDate,
          true,
        )
      } catch (cause) {
        console.error(`An event in the feed could not be read (${uid}):`, cause)
      }
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start))

  return {
    name: asText(calendar.getFirstPropertyValue("x-wr-calname")),
    events: events.slice(0, limit),
  }
}
