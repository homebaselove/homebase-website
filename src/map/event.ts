/**
 * What the client needs to know about an event, free of Effect, which the
 * browser bundle cannot carry. The shapes themselves live in MapEvent.ts.
 */
import type { LumaEvent } from "./MapEvent.ts"

/** What an event without an end time is taken to last. */
const DefaultDurationMs = 3 * 60 * 60_000

export function endOf(event: Pick<LumaEvent, "start" | "end">): number {
  return event.end
    ? Date.parse(event.end)
    : Date.parse(event.start) + DefaultDurationMs
}

export function isUpcoming(
  event: Pick<LumaEvent, "start" | "end">,
  now: number,
): boolean {
  return endOf(event) >= now
}

export function hasPin<T extends Pick<LumaEvent, "lat" | "lng">>(
  event: T,
): event is T & {
  lat: number
  lng: number
} {
  return event.lat !== null && event.lng !== null
}

export const eventUrl = (slug: string) => `https://luma.com/${slug}`

/**
 * Where an event is, in a few words for a list row, or in full for its card,
 * where a venue that keeps its address for guests says so.
 */
export function placeOf(
  event: Pick<LumaEvent, "placement" | "venue" | "address" | "city">,
  detail: "short" | "full",
): string {
  if (event.placement === "online") {
    return detail === "short" ? "Online" : "Online event"
  }

  if (detail === "full" && event.placement === "hidden") {
    return `${
      event.city ?? "Somewhere near here"
    }. The exact address is shared with guests on Luma.`
  }

  return (detail === "short"
    ? [
      event.venue,
      event.city,
    ]
      .filter(Boolean)
      .join(" · ")
    : [
      event.venue,
      event.address ?? event.city,
    ]
      .filter(Boolean)
      .join(", ")) || "Location to be announced"
}
