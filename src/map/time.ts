/**
 * Events read in the zone they happen in, the way Luma shows them, with the
 * viewer's own time alongside when it differs.
 */
import type { LumaEvent } from "./MapEvent.ts"

export function viewerZone(): string {
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

function zoneName(date: Date, zone: string): string {
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
  /** "6:00 – 9:00 PM WEST", in the event's zone. */
  readonly time: string
  /** The start where the viewer is, when that is somewhere else. */
  readonly yours: string | null
}

export function describeWhen(
  event: Pick<LumaEvent, "start" | "end" | "timezone">,
  viewer: string = viewerZone(),
  now: Date = new Date(),
): When {
  const zone = knownZone(event.timezone) ?? viewer
  const start = new Date(event.start)
  const end = event.end ? new Date(event.end) : null
  const time = (date: Date, where: string) =>
    format(date, where, {
      hour: "numeric",
      minute: "2-digit",
    })
  const sameDay = end !== null && dayKey(start, zone) === dayKey(end, zone)
  const span = end === null
    ? `${time(start, zone)} ${zoneName(start, zone)}`
    : sameDay
    ? `${time(start, zone)} – ${time(end, zone)} ${zoneName(start, zone)}`
    : `${time(start, zone)} ${zoneName(start, zone)} until ${
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
    yours: zone !== viewer && knownZone(event.timezone)
      ? `${time(start, viewer)} ${zoneName(start, viewer)} where you are`
      : null,
  }
}
