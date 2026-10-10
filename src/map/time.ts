/**
 * Events read the way Luma shows them: one held somewhere in the zone it
 * happens in, with the viewer's own time alongside when it differs, and one
 * held online in the viewer's own zone, since that is where they join from.
 */
import type { LumaEvent } from "./MapEvent.ts"

function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function knownZone(zone: string | null): string | null {
  if (!zone) {
    return null
  }

  try {
    formatter(zone, {})

    return zone
  } catch {
    return null
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Formatters are costly to make, and the same few serve every row. */
function formatter(
  zone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${zone} ${JSON.stringify(options)}`
  let made = formatters.get(key)

  if (!made) {
    made = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      ...options,
    })
    formatters.set(key, made)
  }

  return made
}

function format(
  date: Date,
  zone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatter(zone, options).format(date)
}

/** The short name of a zone at an instant, as "GMT+1" or "EDT". */
export function zoneName(date: Date, zone: string): string {
  return formatter(zone, {
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")
    ?.value ?? zone
}

const dayKey = (date: Date, zone: string) =>
  format(date, zone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

export interface When {
  /** "Sat, Oct 18", with the year once it is not this one. */
  readonly date: string
  /** "6:00 PM – 9:00 PM GMT+1", in the zone the event reads in. */
  readonly time: string
  /** The start where the viewer is, when that is somewhere else. */
  readonly yours: string | null
}

/** The time of day of an instant in a zone, as "2:00 PM", in the page's English. */
export function timeOf(date: Date, zone: string): string {
  return format(date, zone, {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function describeWhen(
  event:
    & Pick<LumaEvent, "start" | "end" | "timezone">
    & Partial<Pick<LumaEvent, "placement">>,
  viewer: string = viewerZone(),
  now: Date = new Date(),
): When {
  const zone = event.placement === "online"
    ? viewer
    : knownZone(event.timezone) ?? viewer
  const start = new Date(event.start)
  const end = event.end ? new Date(event.end) : null
  const sameDay = end !== null && dayKey(start, zone) === dayKey(end, zone)
  const span = end === null
    ? `${timeOf(start, zone)} ${zoneName(start, zone)}`
    : sameDay
    ? `${timeOf(start, zone)} – ${timeOf(end, zone)} ${zoneName(start, zone)}`
    : `${timeOf(start, zone)} ${zoneName(start, zone)} until ${
      format(end, zone, {
        month: "short",
        day: "numeric",
      })
    }`

  return {
    date: format(start, zone, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(format(start, zone, {
          year: "numeric",
        }) !== format(now, viewer, {
          year: "numeric",
        })
        ? {
          year: "numeric",
        }
        : {}),
    }),
    time: span,
    yours: zone !== viewer
      ? `${timeOf(start, viewer)} ${zoneName(start, viewer)} where you are`
      : null,
  }
}
