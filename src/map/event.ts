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
