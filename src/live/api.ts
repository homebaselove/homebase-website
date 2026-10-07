/**
 * Homebase Live's endpoints, written against the web's Request and Response
 * so the Bun routes and the Vercel functions can both hand requests here.
 * The calendars are iCal feed links attested on Base by an admin, under a
 * schema of their own; this reads them, fetches each feed, keeps what it
 * said for a while, and lists the events ahead.
 */
import { Either, Schema as S } from "effect"
import * as Attestations from "../map/attestations.ts"
import { createLimiter } from "../map/limiter.ts"
import { parseFeedLink } from "./feeds.ts"
import { type Feed, FeedError, type LiveEvent, parseFeed } from "./ics.ts"

export type Route =
  | "live"
  | "preview"

export interface Context {
  readonly env: Record<string, string | undefined>
  readonly fetch: typeof fetch
  readonly now: () => Date
}

/** The schema a calendar is attested under: its iCal feed link, nothing else. */
export const CalendarSchemaText = "string calendar"

/** A calendar shows up everywhere within five minutes; a failing feed keeps the last answer for an hour. */
export const ListCacheControl =
  "public, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600"

/** How long what a feed said stands before it is read again. */
export const ReadAgainAfterMs = 5 * 60_000

/** How long a feed that did not answer is left alone before it is tried again. */
export const RetryAfterMs = 60_000

/** How far ahead the list looks, in days. */
export const HorizonDays = 120

/** Feeds read at once. */
const ReadParallel = 4

/** Past this many bytes a feed is not a calendar anyone meant to share. */
const FeedByteLimit = 2_000_000

const lookups = createLimiter({
  limit: 30,
  windowMs: 60_000,
})

export interface Calendar {
  /** The attestation's UID, which taking the calendar off revokes. */
  readonly uid: string
  readonly url: string
  readonly name: string | null
  readonly addedBy: string
  readonly addedAt: string
  /** Whether the feed answered on the last read. */
  readonly reachable: boolean
  readonly events: number
}

export interface ListedEvent extends LiveEvent {
  /** The calendar the event came from. */
  readonly calendar: string
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  })
}

const error = (status: number, message: string) =>
  json(
    {
      error: message,
    },
    status,
  )

type Handler = (request: Request, ctx: Context) => Promise<Response>

const routes: Record<Route, Partial<Record<string, Handler>>> = {
  live: {
    GET: (_, ctx) => list(ctx),
  },
  preview: {
    POST: preview,
  },
}

export async function handle(
  request: Request,
  route: Route,
  ctx: Context,
): Promise<Response> {
  const method = request.method === "HEAD" ? "GET" : request.method
  const serve = routes[route][method]

  if (!serve) {
    return error(405, "That method isn't served here.")
  }

  try {
    return await serve(request, ctx)
  } catch (cause) {
    console.error(`Homebase Live's ${route} endpoint failed:`, cause)

    return error(500, "Something went wrong on our side.")
  }
}

const clientOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")
  || "local"

/** The feed link inside an attestation, or null for data that is not one. */
function calendarOf(data: string): string | null {
  const text = Attestations.stringOf(data)

  if (text === null) {
    return null
  }

  const link = parseFeedLink(text)

  return link.kind === "ok" ? link.url : null
}

class FetchError extends Error {}

const TooLarge = "That feed is too large to be a calendar."

/** The body as text, read no further than the limit allows. */
async function readWithin(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > limit) {
    throw new FetchError(TooLarge)
  }

  if (!response.body) {
    return await response.text()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    size += value.byteLength

    if (size > limit) {
      await reader.cancel().catch(() => {})

      throw new FetchError(TooLarge)
    }

    chunks.push(value)
  }

  return new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks),
  )
}

/** A feed's text, from an allowed host, within the size limit. */
async function fetchFeed(url: string, ctx: Context): Promise<string> {
  let response: Response

  try {
    response = await ctx.fetch(url, {
      headers: {
        accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
      },
      redirect: "manual",
      signal: AbortSignal.timeout?.(10_000),
    })
  } catch {
    throw new FetchError("The calendar's host didn't answer.")
  }

  if (!response.ok) {
    throw new FetchError(
      response.status >= 300 && response.status < 400
        ? "The calendar's link redirects somewhere else. Paste the feed link itself."
        : `The calendar's host answered ${response.status}.`,
    )
  }

  return readWithin(response, FeedByteLimit)
}

interface Reading {
  /** What the feed last said, or null when it never said anything that was a calendar. */
  readonly feed: Feed | null
  /** Whether the feed answered the last time it was asked. */
  readonly reachable: boolean
  /** When the feed is next asked. */
  readonly again: number
}

/** What each feed last said, per process. */
const readings = new Map<string, Reading>()

/** For a test: forget what the feeds said. */
export function forgetReadings(): void {
  readings.clear()
}

/**
 * The feed behind a calendar: what it said within the last while, or read
 * again. When the host cannot be reached, the last reading stands, marked
 * as such, and the host is left alone for a minute before the next try.
 */
async function readFeed(
  url: string,
  ctx: Context,
  now: Date,
): Promise<Reading> {
  const known = readings.get(url)

  if (known && now.getTime() < known.again) {
    return known
  }

  let text: string

  try {
    text = await fetchFeed(url, ctx)
  } catch (cause) {
    console.error(`The calendar at ${url} could not be read:`, cause)

    const quiet: Reading = {
      feed: known?.feed ?? null,
      reachable: false,
      again: now.getTime() + RetryAfterMs,
    }

    readings.set(url, quiet)

    return quiet
  }

  let feed: Feed | null

  try {
    feed = parseFeed(text, {
      now,
      horizonDays: HorizonDays,
    })
  } catch (cause) {
    if (!(cause instanceof FeedError)) {
      throw cause
    }

    feed = null
  }

  const reading: Reading = {
    feed,
    reachable: true,
    again: now.getTime() + ReadAgainAfterMs,
  }

  readings.set(url, reading)

  return reading
}

async function inBatches<A, B>(
  items: readonly A[],
  size: number,
  work: (item: A) => Promise<B>,
): Promise<B[]> {
  const results: B[] = []

  for (let start = 0; start < items.length; start += size) {
    results.push(
      ...(await Promise.all(items.slice(start, start + size).map(work))),
    )
  }

  return results
}

async function list(ctx: Context): Promise<Response> {
  const now = ctx.now()
  const config = Attestations.configured(ctx.env, CalendarSchemaText)
  let attested: Attestations.Attested<string>[]

  try {
    attested = await Attestations.readAttested(ctx, config, calendarOf)
  } catch (cause) {
    console.error("The calendars could not be read:", cause)

    return error(
      503,
      "Homebase Live's calendars couldn't be read. Try again in a minute.",
    )
  }

  // The same feed attested twice is one calendar.
  const seen = new Set<string>()
  const unique = attested.filter((calendar) => {
    if (seen.has(calendar.value)) {
      return false
    }

    seen.add(calendar.value)

    return true
  })

  const read = await inBatches(unique, ReadParallel, async (calendar) => {
    const reading = await readFeed(calendar.value, ctx, now)
    const events = reading.feed?.events ?? []

    return {
      calendar: {
        uid: calendar.uid,
        url: calendar.value,
        name: reading.feed?.name ?? null,
        addedBy: calendar.by,
        addedAt: new Date(Number(calendar.at) * 1000).toISOString(),
        reachable: reading.reachable,
        events: events.length,
      } satisfies Calendar,
      events: events.map((event): ListedEvent => ({
        ...event,
        calendar: calendar.uid,
      })),
    }
  })

  // One event published on two of the calendars is listed once, under the first.
  const listed = new Set<string>()

  return json(
    {
      calendars: read.map((entry) => entry.calendar),
      events: read
        .flatMap((entry) => entry.events)
        .filter((event) => {
          if (listed.has(event.id)) {
            return false
          }

          listed.add(event.id)

          return true
        })
        .sort((a, b) => a.start.localeCompare(b.start)),
      eas: config.eas,
      admins: config.admins,
      generatedAt: now.toISOString(),
    },
    200,
    {
      "cache-control": ListCacheControl,
    },
  )
}

const PreviewBody = S.Struct({
  url: S.String,
})

/** Reads the feed behind a link, so the admin sees what the chain will point at. */
async function preview(request: Request, ctx: Context): Promise<Response> {
  if (!lookups(clientOf(request), ctx.now().getTime())) {
    return error(429, "Slow down a little and try again in a minute.")
  }

  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return error(400, "Send a JSON body.")
  }

  const decoded = S.decodeUnknownEither(PreviewBody)(raw)

  if (Either.isLeft(decoded)) {
    return error(400, "The request body isn't what this endpoint expects.")
  }

  const link = parseFeedLink(decoded.right.url)

  if (link.kind === "invalid") {
    return error(400, link.message)
  }

  let text: string

  try {
    text = await fetchFeed(link.url, ctx)
  } catch (cause) {
    return error(
      502,
      cause instanceof FetchError
        ? cause.message
        : "The feed could not be read.",
    )
  }

  let feed: Feed

  try {
    feed = parseFeed(text, {
      now: ctx.now(),
      horizonDays: HorizonDays,
    })
  } catch (cause) {
    if (cause instanceof FeedError) {
      return error(422, cause.message)
    }

    throw cause
  }

  // Everything ahead, so the page can list it all the moment the calendar is added.
  return json({
    calendar: {
      url: link.url,
      name: feed.name,
      events: feed.events,
      upcoming: feed.events.length,
    },
  })
}
