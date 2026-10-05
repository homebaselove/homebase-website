/**
 * Turns a Luma link into the event behind it.
 *
 * Luma's public API needs a paid key and only describes events the key's own
 * calendar manages, so a pasted link can only be read the way a browser reads
 * it: from the public event page. The page embeds the JSON the Luma app
 * renders from, which carries the coordinates, the timezone and whether the
 * address is public. The endpoint behind the page answers with the same JSON
 * and stands in when the page cannot be read, and the page's schema.org
 * markup is the last resort. None of these is a documented interface, so every
 * field is checked before it is trusted.
 */
import { Either, Schema as S } from "effect"
import { eventUrl } from "./event.ts"
import type { LumaEvent, Placement } from "./MapEvent.ts"

const LumaHosts = [
  "lu.ma",
  "luma.com",
]

/** Where event pages are read from. luma.com is Luma's current canonical host. */
const PageOrigin = "https://luma.com"

/**
 * The endpoint the Luma app itself reads event pages from, on every host it
 * has answered on; they are asked together and the first answer wins. A host
 * Luma retires answers 404 for everything, so no host's 404 says anything
 * about the event: only the page's does.
 */
export const ApiOrigins = [
  "https://api.lu.ma",
  "https://api.luma.com",
  "https://api2.luma.com",
]

const SlugPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,98}$/

const EventIdPattern = /^evt-[A-Za-z0-9]{8,32}$/

/** Paths on luma.com that are not event pages, though they look like slugs. */
const ReservedSlugs = new Set([
  "api",
  "calendar",
  "create",
  "discover",
  "embed",
  "event",
  "events",
  "explore",
  "help",
  "home",
  "join",
  "login",
  "logout",
  "p",
  "pricing",
  "privacy",
  "settings",
  "signin",
  "signup",
  "subscribe",
  "terms",
  "user",
])

/** Location types Luma uses for events without a venue. */
const OnlineTypes = new Set([
  "custom",
  "google_meet",
  "meet",
  "online",
  "teams",
  "twitch",
  "virtual",
  "youtube",
  "zoom",
])

/** How much of a description the card shows. */
const DescriptionLength = 280

const UserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 HomebaseMap/1.0 (+https://homebase.love)"

export type Link =
  | {
    readonly kind: "slug"
    readonly slug: string
  }
  | {
    readonly kind: "id"
    readonly id: string
  }

export type LinkProblem = {
  readonly kind: "invalid"
  readonly message: string
}

const invalid = (message: string): LinkProblem => ({
  kind: "invalid",
  message,
})

/**
 * Reads a pasted link down to the event it names. Tracking parameters and
 * ticket keys are dropped, since neither belongs in a stored link.
 */
export function parseLink(input: string): Link | LinkProblem {
  const text = input.trim()

  if (!text) {
    return invalid("Paste a link to a Luma event.")
  }

  let url: URL

  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
    )
  } catch {
    return invalid("That doesn't look like a link.")
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return invalid("That doesn't look like a web link.")
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "")

  if (!LumaHosts.includes(host)) {
    return invalid(
      "That link isn't on Luma. Paste a lu.ma or luma.com event link.",
    )
  }

  let segments: string[]

  try {
    segments = url
      .pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent)
  } catch {
    return invalid("That doesn't look like a link.")
  }

  if (segments[0] === "event" && segments.length === 2) {
    return EventIdPattern.test(segments[1])
      ? {
        kind: "id",
        id: segments[1],
      }
      : invalid("Paste the link to a single event page, like luma.com/abc123.")
  }

  if (segments[0] === "embed" && segments[1] === "event" && segments[2]) {
    const target = segments[2]

    return EventIdPattern.test(target)
      ? {
        kind: "id",
        id: target,
      }
      : SlugPattern.test(target)
      ? {
        kind: "slug",
        slug: target,
      }
      : invalid("Paste the link to a single event page, like luma.com/abc123.")
  }

  if (
    segments.length === 1
    && SlugPattern.test(segments[0])
    && !ReservedSlugs.has(segments[0].toLowerCase())
  ) {
    return {
      kind: "slug",
      slug: segments[0],
    }
  }

  return invalid("Paste the link to a single event page, like luma.com/abc123.")
}

export type Source =
  | "page"
  | "api"
  | "markup"

export type Resolution =
  | {
    readonly kind: "event"
    readonly event: LumaEvent
    readonly source: Source
  }
  | {
    readonly kind: "not-found"
  }
  | {
    readonly kind: "calendar"
  }
  | {
    readonly kind: "unavailable"
    readonly message: string
  }

export interface Deps {
  readonly fetch: typeof fetch
  /** How long the page may take to answer. */
  readonly timeoutMs?: number
  /** How long each of the endpoint's hosts may take; they are asked together. */
  readonly apiTimeoutMs?: number
}

const PageTimeoutMs = 10_000

const ApiTimeoutMs = 8_000

const onLuma = (hostname: string) =>
  LumaHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))

export const pageUrl = (link: Link) =>
  link.kind === "slug"
    ? `${PageOrigin}/${encodeURIComponent(link.slug)}`
    : `${PageOrigin}/event/${encodeURIComponent(link.id)}`

export const apiUrl = (link: Link, origin: string = ApiOrigins[0]) =>
  link.kind === "slug"
    ? `${origin}/url?url=${encodeURIComponent(link.slug)}`
    : `${origin}/event/get?event_api_id=${encodeURIComponent(link.id)}`

type Fetched =
  | {
    readonly ok: true
    readonly status: number
    readonly text: string
  }
  | {
    readonly ok: false
    readonly status: number | null
  }

async function fetchText(
  url: string,
  accept: string,
  timeoutMs: number,
  deps: Deps,
): Promise<Fetched> {
  try {
    const response = await deps.fetch(url, {
      headers: {
        accept,
        "user-agent": UserAgent,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    })

    // A redirect that leaves Luma is not Luma's answer.
    if (response.url && !onLuma(new URL(response.url).hostname)) {
      return {
        ok: false,
        status: null,
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
      }
    }

    return {
      ok: true,
      status: response.status,
      text: await response.text(),
    }
  } catch {
    return {
      ok: false,
      status: null,
    }
  }
}

const isGone = (status: number | null) => status === 404 || status === 410

/**
 * The page first, then Luma's endpoint on every host at once, then the page's
 * markup. A 404 from the page means Luma no longer shows the event: cancelling
 * one deletes it, and private events answer the same way. Nothing else counts
 * as gone, so a retired host or a bad hour at Luma leaves pins standing.
 */
export async function resolve(link: Link, deps: Deps): Promise<Resolution> {
  const page = await fetchText(
    pageUrl(link),
    "text/html",
    deps.timeoutMs ?? PageTimeoutMs,
    deps,
  )

  if (!page.ok && isGone(page.status)) {
    return {
      kind: "not-found",
    }
  }

  if (page.ok) {
    const embedded = readEmbedded(page.text, link)

    if (embedded) {
      return embedded
    }
  }

  const answers = await Promise.all(
    ApiOrigins.map((origin) =>
      fetchText(
        apiUrl(link, origin),
        "application/json",
        deps.apiTimeoutMs ?? ApiTimeoutMs,
        deps,
      )
    ),
  )
  let answered = false

  for (const api of answers) {
    if (!api.ok) {
      continue
    }

    answered = true

    const read = readApi(api.text, link)

    if (read) {
      return read
    }
  }

  if (page.ok) {
    const marked = readMarkup(page.text, link)

    if (marked) {
      return marked
    }
  }

  return {
    kind: "unavailable",
    message: page.ok || answered
      ? "Luma's event page changed shape and couldn't be read. Try again later."
      : "Luma didn't answer. Try again in a minute.",
  }
}

const Text = S.optional(S.NullOr(S.String))

const GeoAddressInfo = S.Struct({
  address: Text,
  city: Text,
  region: Text,
  country: Text,
  city_state: Text,
  full_address: Text,
  description: Text,
  mode: Text,
})

const Coordinate = S.Struct({
  latitude: S.Number,
  longitude: S.Number,
})

const EventPayload = S.Struct({
  api_id: Text,
  name: S.String,
  url: S.String,
  start_at: S.String,
  end_at: Text,
  timezone: Text,
  cover_url: Text,
  location_type: Text,
  geo_address_visibility: Text,
  coordinate: S.optional(S.NullOr(Coordinate)),
  geo_latitude: Text,
  geo_longitude: Text,
  geo_address_info: S.optional(S.NullOr(GeoAddressInfo)),
})

const Named = S.Struct({
  name: Text,
})

/** What Luma's endpoint and the page's embedded JSON both carry for an event. */
const EventData = S.Struct({
  event: EventPayload,
  hosts: S.optional(S.NullOr(S.Array(Named))),
  calendar: S.optional(S.NullOr(Named)),
  description_mirror: S.optional(S.Unknown),
})

const Answer = S.Struct({
  kind: S.String,
  data: S.Unknown,
})

const decodeEventData = S.decodeUnknownEither(EventData)

const decodeAnswer = S.decodeUnknownEither(Answer)

/** The page's embedded JSON, which is the endpoint's answer for the page. */
export function readEmbedded(html: string, link: Link): Resolution | null {
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  )

  if (!match) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(match[1])
  } catch {
    return null
  }

  const initial = (parsed as {
    props?: {
      pageProps?: {
        initialData?: unknown
      }
    }
  })
    ?.props
    ?.pageProps
    ?.initialData

  return fromAnswer(initial, link, "page")
}

/** Luma's endpoint answers for a slug with a kind, and for an id with the data alone. */
function readApi(text: string, link: Link): Resolution | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  return link.kind === "slug"
    ? fromAnswer(parsed, link, "api")
    : fromData(parsed, link, "api")
}

function fromAnswer(
  answer: unknown,
  link: Link,
  source: Source,
): Resolution | null {
  const decoded = decodeAnswer(answer)

  if (Either.isLeft(decoded)) {
    return null
  }

  if (decoded.right.kind === "calendar") {
    return {
      kind: "calendar",
    }
  }

  if (decoded.right.kind !== "event") {
    return null
  }

  return fromData(decoded.right.data, link, source)
}

function fromData(
  data: unknown,
  link: Link,
  source: Source,
): Resolution | null {
  const event = fromPayload(data, link)

  return event
    ? {
      kind: "event",
      event,
      source,
    }
    : null
}

/** Shapes Luma's event JSON into a pinnable event, or nothing when it does not add up. */
export function fromPayload(data: unknown, link: Link): LumaEvent | null {
  const decoded = decodeEventData(data)

  if (Either.isLeft(decoded)) {
    return null
  }

  const { event, hosts, calendar, description_mirror } = decoded.right
  const slug = event.url.split("/").filter(Boolean).at(-1)
    ?? (link.kind === "slug" ? link.slug : null)
  const start = instant(event.start_at)

  if (!slug || !SlugPattern.test(slug) || !start || !event.name.trim()) {
    return null
  }

  const info = event.geo_address_info ?? null
  const coordinate = event.coordinate
    ?? numericCoordinate(event.geo_latitude, event.geo_longitude)
  const online = event.location_type
    ? OnlineTypes.has(event.location_type.toLowerCase())
    : false
  const hidden = event.geo_address_visibility === "guests-only"
    || info?.mode === "obfuscated"
  const placement: Placement = online
    ? "online"
    : !coordinate
    ? "unknown"
    : hidden
    ? "hidden"
    : "venue"
  const city = info?.city_state
    ?? [
      info?.city,
      info?.country,
    ]
      .filter(Boolean)
      .join(", ")

  return {
    slug,
    lumaId: event.api_id ?? null,
    url: eventUrl(slug),
    title: event.name.trim(),
    description: excerpt(proseMirrorText(description_mirror)),
    start,
    end: event.end_at ? instant(event.end_at) : null,
    timezone: event.timezone ?? null,
    venue: placement === "venue"
      ? info?.description ?? info?.address ?? null
      : null,
    address: placement === "venue" ? info?.full_address ?? null : null,
    city: city || null,
    lat: online ? null : coordinate?.latitude ?? null,
    lng: online ? null : coordinate?.longitude ?? null,
    placement,
    cover: event.cover_url ?? null,
    hosts: (hosts ?? [])
      .map((host) => host.name?.trim())
      .filter((name): name is string => !!name),
    calendar: calendar?.name?.trim() || null,
  }
}

function numericCoordinate(
  latitude: string | null | undefined,
  longitude: string | null | undefined,
) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  return latitude && longitude && Number.isFinite(lat) && Number.isFinite(lng)
    ? {
      latitude: lat,
      longitude: lng,
    }
    : null
}

/** A date Luma wrote, as a UTC instant, or nothing when it does not parse. */
function instant(value: string): string | null {
  const time = Date.parse(value)

  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/** The plain text of a ProseMirror document, with one line per block. */
export function proseMirrorText(doc: unknown): string | null {
  const parts: string[] = []

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return
    }

    const { type, text, content } = node as {
      type?: string
      text?: string
      content?: unknown[]
    }

    if (typeof text === "string") {
      parts.push(text)
    }

    if (Array.isArray(content)) {
      content.forEach(walk)
    }

    if (type === "paragraph" || type === "heading" || type === "list_item") {
      parts.push("\n")
    }
  }

  walk(doc)

  const joined = parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()

  return joined || null
}

/** Cuts a description down to card length at a word boundary. */
export function excerpt(text: string | null): string | null {
  if (!text) {
    return null
  }

  const flat = text.replace(/\s+/g, " ").trim()

  if (flat.length <= DescriptionLength) {
    return flat
  }

  const cut = flat.slice(0, DescriptionLength)
  const boundary = cut.lastIndexOf(" ")

  return `${
    cut.slice(
      0,
      boundary > DescriptionLength / 2 ? boundary : DescriptionLength,
    )
  }…`
}

const JsonLdEvent = S.Struct({
  "@type": S.Union(S.String, S.Array(S.String)),
  name: S.String,
  startDate: S.String,
  endDate: Text,
  description: Text,
  image: S.optional(S.NullOr(S.Union(S.String, S.Array(S.String)))),
  eventAttendanceMode: Text,
  eventStatus: Text,
  location: S.optional(S.Unknown),
})

const decodeJsonLd = S.decodeUnknownEither(JsonLdEvent)

/**
 * The schema.org Event the page publishes for search engines. It carries no
 * Luma id and no timezone, and its coordinates are a hope rather than a
 * promise, so it only stands in when the richer sources are gone.
 */
export function readMarkup(html: string, link: Link): Resolution | null {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ]
  const slug = link.kind === "slug" ? link.slug : null

  if (!slug) {
    return null
  }

  for (const [, body] of scripts) {
    let parsed: unknown

    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }

    for (const candidate of jsonLdNodes(parsed)) {
      const decoded = decodeJsonLd(candidate)

      if (Either.isLeft(decoded)) {
        continue
      }

      const node = decoded.right
      const types = Array.isArray(node["@type"])
        ? node["@type"]
        : [node["@type"]]

      if (!types.some((type) => /Event$/.test(type))) {
        continue
      }

      if (/Cancelled/i.test(node.eventStatus ?? "")) {
        return {
          kind: "not-found",
        }
      }

      const start = instant(node.startDate)

      if (!start) {
        continue
      }

      const place = readPlace(node.location)
      const online = /Online/i.test(node.eventAttendanceMode ?? "")
        || place.kind === "virtual"
      const coordinate = place.kind === "place" ? place.coordinate : null
      const image = Array.isArray(node.image) ? node.image[0] : node.image

      return {
        kind: "event",
        source: "markup",
        event: {
          slug,
          lumaId: null,
          url: eventUrl(slug),
          title: node.name.trim(),
          description: excerpt(node.description ?? null),
          start,
          end: node.endDate ? instant(node.endDate) : null,
          timezone: null,
          venue: place.kind === "place" ? place.name : null,
          address: place.kind === "place" ? place.address : null,
          city: place.kind === "place" ? place.city : null,
          lat: online ? null : coordinate?.latitude ?? null,
          lng: online ? null : coordinate?.longitude ?? null,
          placement: online ? "online" : coordinate ? "venue" : "unknown",
          cover: image ?? null,
          hosts: [],
          calendar: null,
        },
      }
    }
  }

  return null
}

function jsonLdNodes(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap(jsonLdNodes)
  }

  if (parsed && typeof parsed === "object" && "@graph" in parsed) {
    return jsonLdNodes(
      (parsed as {
        "@graph": unknown
      })["@graph"],
    )
  }

  return [
    parsed,
  ]
}

type Place =
  | {
    readonly kind: "place"
    readonly name: string | null
    readonly address: string | null
    readonly city: string | null
    readonly coordinate: {
      readonly latitude: number
      readonly longitude: number
    } | null
  }
  | {
    readonly kind: "virtual"
  }
  | {
    readonly kind: "none"
  }

function readPlace(location: unknown): Place {
  const first = Array.isArray(location) ? location[0] : location

  if (!first || typeof first !== "object") {
    return {
      kind: "none",
    }
  }

  const place = first as {
    "@type"?: string
    name?: string
    address?:
      | string
      | {
        streetAddress?: string
        addressLocality?: string
        addressRegion?: string
        addressCountry?: string
      }
    geo?: {
      latitude?: number | string
      longitude?: number | string
    }
  }

  if (place["@type"] === "VirtualLocation") {
    return {
      kind: "virtual",
    }
  }

  const address = typeof place.address === "string"
    ? place.address
    : [
      place.address?.streetAddress,
      place.address?.addressLocality,
      place.address?.addressRegion,
      place.address?.addressCountry,
    ]
      .filter(Boolean)
      .join(", ")
  const city = typeof place.address === "object"
    ? [
      place.address.addressLocality,
      place.address.addressCountry,
    ]
      .filter(Boolean)
      .join(", ")
    : ""
  const coordinate = numericCoordinate(
    place.geo?.latitude === undefined ? null : String(place.geo.latitude),
    place.geo?.longitude === undefined ? null : String(place.geo.longitude),
  )

  return {
    kind: "place",
    name: place.name?.trim() || null,
    address: address || null,
    city: city || null,
    coordinate,
  }
}
