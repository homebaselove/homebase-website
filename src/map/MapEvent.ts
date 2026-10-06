import { Schema as S } from "effect"

/**
 * How an event sits on the map. A venue has public coordinates. A hidden
 * venue shares its exact address with guests only, so Luma hands out a coarse
 * coordinate that pins the city. Online events and events whose address could
 * not be located have no pin and live in the list alone.
 */
export const Placement = S.Literal("venue", "hidden", "online", "unknown")

export type Placement = typeof Placement.Type

/** An event as read from its Luma page, before anyone pins it. */
export const LumaEvent = S.Struct({
  /** The path on luma.com, which is also the public id of a pin. */
  slug: S.String,
  /** Luma's own id, evt-…, when the page carried it. */
  lumaId: S.NullOr(S.String),
  url: S.String,
  title: S.String,
  description: S.NullOr(S.String),
  /** ISO instants in UTC. */
  start: S.String,
  end: S.NullOr(S.String),
  /** The IANA zone the event is held in, when known. */
  timezone: S.NullOr(S.String),
  venue: S.NullOr(S.String),
  address: S.NullOr(S.String),
  city: S.NullOr(S.String),
  lat: S.NullOr(S.Number),
  lng: S.NullOr(S.Number),
  placement: Placement,
  cover: S.NullOr(S.String),
  hosts: S.Array(S.String),
  /** The Luma calendar hosting the event, when there is one. */
  calendar: S.NullOr(S.String),
})

export type LumaEvent = typeof LumaEvent.Type

/** Live, or gone from Luma since it was pinned. */
export const EventStatus = S.Literal("live", "gone")

export type EventStatus = typeof EventStatus.Type

/** A pinned event: what Luma said, who pinned it, and when it was last read. */
export const MapEvent = S.Struct({
  ...LumaEvent.fields,
  status: EventStatus,
  addedBy: S.String,
  addedAt: S.String,
  checkedAt: S.String,
})

export type MapEvent = typeof MapEvent.Type
