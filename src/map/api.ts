/**
 * The map's endpoints, written against the web's Request and Response so the
 * Bun routes and the Vercel functions can both hand requests here and send
 * back what comes out.
 */
import { Either, Schema as S } from "effect"
import * as Auth from "./auth.ts"
import { createLimiter } from "./limiter.ts"
import * as Luma from "./luma.ts"
import type { MapEvent } from "./MapEvent.ts"
import * as Repo from "./store.ts"
import type { Store } from "./store.ts"

export type Route =
  | "map"
  | "preview"
  | "refresh"
  | "nonce"
  | "verify"
  | "session"

export interface Context {
  readonly store: Store
  readonly env: Record<string, string | undefined>
  readonly fetch: typeof fetch
  readonly now: () => Date
}

/**
 * A pin shows up everywhere within a minute of being added, and a failing
 * store keeps the last answer on the CDN for an hour.
 */
export const ListCacheControl =
  "public, s-maxage=60, stale-while-revalidate=600, stale-if-error=3600"

/** How long a pin's reading stands before a refresh reads Luma again. */
export const RefreshAfterMs = 6 * 60 * 60_000

/** How long after an event ends refreshes stop caring about it. */
export const RefreshGraceMs = 24 * 60 * 60_000

/** Pins a refresh pass may read; the time budget below usually stops it first. */
export const RefreshBatch = 100

/** How long a refresh pass may run, inside the minute a Vercel function gets. */
export const RefreshBudgetMs = 45_000

/** Pins read at once during a refresh. */
const RefreshParallel = 4

const signIns = createLimiter({
  limit: 10,
  windowMs: 60_000,
})

const writes = createLimiter({
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

const methodNotAllowed = (allowed: string[]) =>
  json(
    {
      error: `Use ${allowed.join(" or ")} here.`,
    },
    405,
    {
      allow: allowed.join(", "),
    },
  )

export async function handle(
  request: Request,
  route: Route,
  ctx: Context,
): Promise<Response> {
  // A HEAD is answered like the GET it stands for.
  const method = request.method === "HEAD" ? "GET" : request.method

  try {
    switch (route) {
      case "map":
        switch (method) {
          case "GET":
            return await list(ctx)
          case "POST":
            return await submit(request, ctx, false)
          case "DELETE":
            return await remove(request, ctx)
          default:
            return methodNotAllowed([
              "GET",
              "POST",
              "DELETE",
            ])
        }
      case "preview":
        return method === "POST"
          ? await submit(request, ctx, true)
          : methodNotAllowed([
            "POST",
          ])
      case "refresh":
        return method === "POST" || method === "GET"
          ? await refresh(request, ctx)
          : methodNotAllowed([
            "GET",
            "POST",
          ])
      case "nonce":
        return method === "POST"
          ? await nonce(request, ctx)
          : methodNotAllowed([
            "POST",
          ])
      case "verify":
        return method === "POST"
          ? await verify(request, ctx)
          : methodNotAllowed([
            "POST",
          ])
      case "session":
        switch (method) {
          case "GET":
            return await session(request, ctx)
          case "DELETE":
            return await signOut(request, ctx)
          default:
            return methodNotAllowed([
              "GET",
              "DELETE",
            ])
        }
    }
  } catch (cause) {
    console.error(`The map's ${route} endpoint failed:`, cause)

    return error(500, "Something went wrong on our side.")
  }
}

const clientOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")
  || "local"

/**
 * The host a sign-in message is written for. Headers name it, and a proxy may
 * pass a caller's own along, so only a host the configuration knows is used.
 */
function siteOf(request: Request, config: Auth.AuthConfig) {
  const domain = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")

  if (!domain) {
    return error(400, "The request names no host.")
  }

  if (!Auth.siteAllowed(config, domain)) {
    return error(
      400,
      "Wallet sign-in isn't set up for this address of the site. Add its hostname to HOMEBASE_SITE_HOSTS.",
    )
  }

  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(domain)
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || (local ? "http" : "https")

  return {
    domain,
    origin: `${scheme}://${domain}/`,
  }
}

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

async function list(ctx: Context): Promise<Response> {
  const events = await Repo.listEvents(ctx.store)

  return json(
    {
      events,
      generatedAt: ctx.now().toISOString(),
    },
    200,
    {
      "cache-control": ListCacheControl,
    },
  )
}

const SubmitBody = S.Struct({
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

/** Reads the event behind a link, and pins it unless this is a preview. */
async function submit(
  request: Request,
  ctx: Context,
  preview: boolean,
): Promise<Response> {
  const config = Auth.configFrom(ctx.env)
  const now = ctx.now()
  const actor = await Auth.authenticate(request, ctx.store, config, now)

  if (!actor) {
    return error(401, "Sign in to add events.")
  }

  if (!writes(clientOf(request), now.getTime())) {
    return error(429, "Slow down a little and try again in a minute.")
  }

  const input = await body(request, SubmitBody)

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

  if (preview) {
    return json({
      event: resolution.event,
      source: resolution.source,
    })
  }

  // An organizer can rename a link, so the pin may sit under an older slug.
  const existing = await Repo.getEvent(ctx.store, resolution.event.slug)
    ?? (resolution.event.lumaId
      ? await Repo.getEventByLumaId(ctx.store, resolution.event.lumaId)
      : null)
  const stored = await Repo.putEvent(
    ctx.store,
    reconcile(existing, resolution, {
      addedBy: actor.address ?? "admin",
      now: now.toISOString(),
    }),
  )

  return json(
    {
      event: stored,
      source: resolution.source,
    },
    existing?.status === "live" ? 200 : 201,
  )
}

async function remove(request: Request, ctx: Context): Promise<Response> {
  const config = Auth.configFrom(ctx.env)
  const actor = await Auth.authenticate(request, ctx.store, config, ctx.now())

  if (!actor) {
    return error(401, "Sign in to remove events.")
  }

  const slug = new URL(request.url).searchParams.get("slug")

  if (!slug) {
    return error(400, "Say which event to remove.")
  }

  const existing = await Repo.getEvent(ctx.store, slug)

  if (!existing) {
    return error(404, "That event isn't on the map.")
  }

  if (actor.role !== "admin" && existing.addedBy !== actor.address) {
    return error(
      403,
      "Only the wallet that added an event, or an admin, can remove it.",
    )
  }

  await Repo.removeEvent(ctx.store, slug)

  return json({
    removed: slug,
  })
}

export interface RefreshReport {
  readonly checked: number
  readonly updated: number
  readonly gone: number
  readonly failed: number
  /** Stale pins the pass did not get to before its time ran out. */
  readonly remaining: number
}

type Found = Extract<
  Luma.Resolution,
  {
    kind: "event"
  }
>

/**
 * What to store for an event read again. The page and the endpoint carry
 * everything, so they replace what was known; the markup carries less, so
 * what it cannot say is kept from the last full reading rather than blanked.
 */
export function reconcile(
  existing: MapEvent | null,
  found: Found,
  stamp: {
    readonly addedBy: string
    readonly now: string
  },
): MapEvent {
  const read = found.event
  const kept = existing && found.source === "markup"
    ? {
      lumaId: read.lumaId ?? existing.lumaId,
      timezone: read.timezone ?? existing.timezone,
      hosts: read.hosts.length > 0 ? read.hosts : existing.hosts,
      calendar: read.calendar ?? existing.calendar,
      cover: read.cover ?? existing.cover,
      description: read.description ?? existing.description,
      ...(read.placement === "unknown" && existing.placement !== "unknown"
        ? {
          venue: existing.venue,
          address: existing.address,
          city: existing.city,
          lat: existing.lat,
          lng: existing.lng,
          placement: existing.placement,
        }
        : {}),
    }
    : {}

  return {
    ...read,
    ...kept,
    status: "live",
    addedBy: existing?.addedBy ?? stamp.addedBy,
    addedAt: existing?.addedAt ?? stamp.now,
    checkedAt: stamp.now,
  }
}

/**
 * Reads Luma again for pins whose reading has aged, a few at a time, until
 * the batch or the time budget runs out.
 */
export async function refreshStale(ctx: Context): Promise<RefreshReport> {
  const started = ctx.now().getTime()
  const queue = await Repo.staleEvents(ctx.store, {
    checkedBefore: new Date(started - RefreshAfterMs).toISOString(),
    endedAfter: new Date(started - RefreshGraceMs).toISOString(),
    limit: RefreshBatch,
  })
  const report = {
    checked: 0,
    updated: 0,
    gone: 0,
    failed: 0,
    remaining: queue.length,
  }

  const pass = async () => {
    while (
      queue.length > 0 && ctx.now().getTime() - started < RefreshBudgetMs
    ) {
      const event = queue.shift()!

      report.remaining -= 1
      report.checked += 1

      const checkedAt = ctx.now().toISOString()
      const resolution = await Luma.resolve(
        {
          kind: "slug",
          slug: event.slug,
        },
        {
          fetch: ctx.fetch,
        },
      )

      switch (resolution.kind) {
        case "event": {
          await Repo.putEvent(
            ctx.store,
            reconcile(event, resolution, {
              addedBy: event.addedBy,
              now: checkedAt,
            }),
          )
          report.updated += 1
          break
        }
        case "not-found":
        case "calendar": {
          await Repo.markGone(ctx.store, event.slug, checkedAt)
          report.gone += 1
          break
        }
        case "unavailable": {
          await Repo.touchEvent(ctx.store, event.slug, checkedAt)
          report.failed += 1
          break
        }
      }
    }
  }

  await Promise.all(
    Array.from({
      length: RefreshParallel,
    }, pass),
  )

  return report
}

async function refresh(request: Request, ctx: Context): Promise<Response> {
  const config = Auth.configFrom(ctx.env)
  const allowed = Auth.isCron(request, config)
    || await Auth.authenticate(request, ctx.store, config, ctx.now())

  if (!allowed) {
    return error(401, "Sign in to refresh events.")
  }

  return json(await refreshStale(ctx))
}

const NonceBody = S.Struct({
  address: S.String,
})

async function nonce(request: Request, ctx: Context): Promise<Response> {
  const config = Auth.configFrom(ctx.env)

  if (!Auth.walletSignInOpen(config)) {
    return error(404, "Wallet sign-in isn't open yet.")
  }

  const now = ctx.now()

  if (!signIns(clientOf(request), now.getTime())) {
    return error(429, "Too many sign-in attempts. Try again in a minute.")
  }

  const site = siteOf(request, config)

  if (site instanceof Response) {
    return site
  }

  const input = await body(request, NonceBody)

  if (input instanceof Response) {
    return input
  }

  const issued = await Auth.issueSignIn(
    ctx.store,
    {
      address: input.address,
      domain: site.domain,
      origin: site.origin,
    },
    now,
  )

  return Auth.isFailure(issued)
    ? error(issued.status, issued.error)
    : json(issued)
}

const VerifyBody = S.Struct({
  message: S.String,
  signature: S.String,
})

async function verify(request: Request, ctx: Context): Promise<Response> {
  const config = Auth.configFrom(ctx.env)
  const now = ctx.now()

  if (!signIns(clientOf(request), now.getTime())) {
    return error(429, "Too many sign-in attempts. Try again in a minute.")
  }

  const site = siteOf(request, config)

  if (site instanceof Response) {
    return site
  }

  const input = await body(request, VerifyBody)

  if (input instanceof Response) {
    return input
  }

  const signedIn = await Auth.verifySignIn(ctx.store, input, config, {
    fetch: ctx.fetch,
    now,
    domain: site.domain,
  })

  if (Auth.isFailure(signedIn)) {
    return error(signedIn.status, signedIn.error)
  }

  return json({
    token: signedIn.token,
    ...signedIn.actor,
  })
}

async function session(request: Request, ctx: Context): Promise<Response> {
  const config = Auth.configFrom(ctx.env)
  const actor = await Auth.authenticate(request, ctx.store, config, ctx.now())

  return json({
    actor,
    walletSignIn: Auth.walletSignInOpen(config),
  })
}

async function signOut(request: Request, ctx: Context): Promise<Response> {
  await Auth.signOut(request, ctx.store)

  return json({
    signedOut: true,
  })
}

export type {
  MapEvent,
}
