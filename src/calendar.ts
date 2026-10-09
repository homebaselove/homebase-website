/**
 * An event, ready for someone's own calendar: a Google Calendar link, and an
 * iCalendar file that Apple Calendar, Outlook and every other calendar app
 * open. The file follows RFC 5545: escaped text, lines folded at 75 octets,
 * the UID and DTSTAMP every event must carry, and a date, not a time, for an
 * event that lasts all day.
 */

export interface CalendarEvent {
  readonly title: string
  readonly start: Date
  readonly end: Date
  /** All day: the date of start, through the day before the date of end. */
  readonly allDay?: boolean
  readonly description?: string | null
  readonly location?: string | null
  /** The event's own page, which the entry links back to. */
  readonly url?: string | null
}

const Day = 24 * 60 * 60_000

/** 20261009T170000Z, the instant in UTC. */
const instant = (date: Date) =>
  date.toISOString().replace(/-|:|\.\d+/g, "")

/** 20261009, the date itself. */
const dateOnly = (date: Date) =>
  date
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "")

/** An all-day event always covers at least its own day. */
const lastDay = (event: CalendarEvent) =>
  event.end.getTime() > event.start.getTime()
    ? event.end
    : new Date(event.start.getTime() + Day)

/** What the entry says beyond its title: the description, then the link. */
const details = (event: CalendarEvent) =>
  [
    event.description,
    event.url,
  ]
    .filter(Boolean)
    .join("\n\n")

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: event.allDay
      ? `${dateOnly(event.start)}/${dateOnly(lastDay(event))}`
      : `${instant(event.start)}/${instant(event.end)}`,
  })
  const about = details(event)

  if (about) {
    params.set("details", about)
  }

  if (event.location) {
    params.set("location", event.location)
  }

  return `https://calendar.google.com/calendar/render?${params}`
}

/** A TEXT value, with the characters RFC 5545 reserves escaped. */
export const escapeText = (text: string) =>
  text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")

const encoder = new TextEncoder()

/**
 * A content line folded so no line runs past 75 octets: each continuation
 * starts with a space, and a character never splits across two lines.
 */
export function fold(line: string): string {
  const lines: string[] = []
  let current = ""
  let octets = 0

  for (const character of line) {
    const size = encoder.encode(character).length
    const room = lines.length === 0 ? 75 : 74

    if (octets + size > room) {
      lines.push(current)
      current = ""
      octets = 0
    }

    current += character
    octets += size
  }

  lines.push(current)

  return lines.join("\r\n ")
}

/** A UID that stays the same for the same event, so adding it twice updates it. */
function uidOf(event: CalendarEvent): string {
  const key = `${event.url ?? event.title}|${event.start.toISOString()}`
  let hash = 0x811c9dc5

  for (const character of key) {
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `${hash.toString(16).padStart(8, "0")}@homebase.love`
}

export function icsFile(event: CalendarEvent, now: Date = new Date()): string {
  const about = details(event)

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Homebase//homebase.love//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uidOf(event)}`,
    `DTSTAMP:${instant(now)}`,
    ...(event.allDay
      ? [
        `DTSTART;VALUE=DATE:${dateOnly(event.start)}`,
        `DTEND;VALUE=DATE:${dateOnly(lastDay(event))}`,
      ]
      : [
        `DTSTART:${instant(event.start)}`,
        `DTEND:${instant(event.end)}`,
      ]),
    `SUMMARY:${escapeText(event.title)}`,
    ...(about ? [`DESCRIPTION:${escapeText(about)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n")
}

/** A file name for the event: its title in plain letters and digits. */
export const icsName = (event: CalendarEvent) =>
  `${
    event.title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "event"
  }.ics`
