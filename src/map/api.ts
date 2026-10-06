/**
 * The map's endpoints, written against the web's Request and Response so the
 * Bun routes and the Vercel functions can both hand requests here and send
 * back what comes out. The pins are Luma slugs attested on Base; this reads
 * them and looks each one up on Luma, keeping what Luma said for a while so
 * a list is not a round of Luma reads every time.
 */
import { Either, Schema as S } from "effect"
import * as Attestations from "./attestations.ts"
import { eventUrl } from "./event.ts"
import { createLimiter } from "./limiter.ts"
import * as Luma from "./luma.ts"
import type { LumaEvent, MapEvent } from "./MapEvent.ts"

export type Route =
  | "map"
  | "preview"

export interface Context {
  readonly env: Record<string, string | undefined>
  readonly fetch: typeof fetch
  readonly now: () => Date
}

/**
 * A pin shows up everywhere within a minute of landing on the chain, and a
 * failing chain or Luma keeps the last answer on the CDN for an hour.
 */
export const ListCacheControl =
  "public, s-maxage=60, stale-while-revalidate=600, stale-if-error=3600"

/** How long what Luma said about a pin stands before it is read again. */
export const ReadAgainAfterMs = 30 * 60_000

/** Pins read from Luma at once. */
const ReadParallel = 4

const lookups = createLimiter({
  limit: 30,
  windowMs: 60_000,
})

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

/** What each route serves, by method. Both deploys export exactly these. */
const routes: Record<Route, Partial<Record<string, Handler>>> = {
  map: {
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
  // A HEAD is answered like the GET it stands for; the body is dropped downstream.
  const method = request.method === "HEAD" ? "GET" : request.method
  const serve = routes[route][method]

  if (!serve) {
    return error(405, "That method isn't served here.")
  }

  try {
    return await serve(request, ctx)
  } catch (cause) {
    console.error(`The map's ${route} endpoint failed:`, cause)

    return error(500, "Something went wrong on our side.")
  }
}

const clientOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")
  || "local"

async function body<A, I>(
  request: Request,
  schema: S.Schema<A, I>,
): Promise<A | Response> {
  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return error(400, "Send a JSON body.")
  }

  const decoded = S.decodeUnknownEither(schema)(raw)

  return Either.isLeft(decoded)
    ? error(400, "The request body isn't what this endpoint expects.")
    : decoded.right
}

interface Reading {
  /** What Luma said, or null when Luma has no such event. */
  readonly event: LumaEvent | null
  readonly at: number
}

/** What Luma last said about each pinned slug, per process. */
const readings = new Map<string, Reading>()

/** For a test: forget what Luma said. */
export function forgetReadings(): void {
  readings.clear()
}

/**
 * The event behind a pinned slug: what Luma said within the last while, or
 * Luma asked again. When Luma cannot be reached, the last reading stands;
 * undefined is a slug nothing is known about.
 */
async function readSlug(
  slug: string,
  ctx: Context,
  now: number,
): Promise<LumaEvent | null | undefined> {
  const known = readings.get(slug)

  if (known && now - known.at < ReadAgainAfterMs) {
    return known.event
  }

  const link = Luma.parseLink(eventUrl(slug))

  if (link.kind === "invalid") {
    return null
  }

  const resolution = await Luma.resolve(link, {
    fetch: ctx.fetch,
  })

  if (resolution.kind === "unavailable") {
    return known?.event
  }

  const event = resolution.kind === "event" ? resolution.event : null

  readings.set(slug, {
    event,
    at: now,
  })

  return event
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
  const config = Attestations.configured(ctx.env)
  let pins: Attestations.Pin[]

  try {
    pins = await Attestations.readPins(ctx, config)
  } catch (cause) {
    console.error("The pins could not be read:", cause)

    return error(503, "The map's pins couldn't be read. Try again in a minute.")
  }

  const read = await inBatches(pins, ReadParallel, async (pin) => {
    const event = await readSlug(pin.slug, ctx, now.getTime())

    return event
      ? {
        ...event,
        slug: pin.slug,
        uid: pin.uid,
        addedBy: pin.by,
        addedAt: new Date(Number(pin.pinnedAt) * 1000).toISOString(),
      } satisfies MapEvent
      : null
  })

  return json(
    {
      events: read.filter((event) => event !== null),
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

function describe(
  resolution: Exclude<Luma.Resolution, {
    kind: "event"
  }>,
): Response {
  switch (resolution.kind) {
    case "not-found":
      return error(
        404,
        "Luma shows no public event at that link. It may be private, cancelled, or mistyped.",
      )
    case "calendar":
      return error(
        422,
        "That link is a Luma calendar. Paste a link to a single event.",
      )
    case "unavailable":
      return error(502, resolution.message)
  }
}

/** Reads the event behind a link, so the person pinning sees what the chain will point at. */
async function preview(request: Request, ctx: Context): Promise<Response> {
  if (!lookups(clientOf(request), ctx.now().getTime())) {
    return error(429, "Slow down a little and try again in a minute.")
  }

  const input = await body(request, PreviewBody)

  if (input instanceof Response) {
    return input
  }

  const link = Luma.parseLink(input.url)

  if (link.kind === "invalid") {
    return error(400, link.message)
  }

  const resolution = await Luma.resolve(link, {
    fetch: ctx.fetch,
  })

  if (resolution.kind !== "event") {
    return describe(resolution)
  }

  return json({
    event: resolution.event,
    source: resolution.source,
  })
}
