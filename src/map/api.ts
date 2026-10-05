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

/** Pins read per refresh pass, so one pass stays well inside a function's time. */
export const RefreshBatch = 25

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
  try {
    switch (route) {
      case "map":
        switch (request.method) {
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
        return request.method === "POST"
          ? await submit(request, ctx, true)
          : methodNotAllowed([
            "POST",
          ])
      case "refresh":
        return request.method === "POST" || request.method === "GET"
          ? await refresh(request, ctx)
          : methodNotAllowed([
            "POST",
          ])
      case "nonce":
        return request.method === "POST"
          ? await nonce(request, ctx)
          : methodNotAllowed([
            "POST",
          ])
      case "verify":
        return request.method === "POST"
          ? await verify(request, ctx)
          : methodNotAllowed([
            "POST",
          ])
      case "session":
        switch (request.method) {
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

function siteOf(request: Request) {
  const domain = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")

  if (!domain) {
    return null
  }

  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(domain)
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

  const existing = await Repo.getEvent(ctx.store, resolution.event.slug)
  const nowIso = now.toISOString()
  const stored = await Repo.putEvent(ctx.store, {
    ...resolution.event,
    status: "live",
    addedBy: existing?.addedBy ?? actor.address ?? "admin",
    addedAt: existing?.addedAt ?? nowIso,
    checkedAt: nowIso,
  })

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
}

/** Reads Luma again for pins whose reading has aged, one batch at a time. */
export async function refreshStale(ctx: Context): Promise<RefreshReport> {
  const now = ctx.now()
  const stale = await Repo.staleEvents(ctx.store, {
    checkedBefore: new Date(now.getTime() - RefreshAfterMs).toISOString(),
    endedAfter: new Date(now.getTime() - RefreshGraceMs).toISOString(),
    limit: RefreshBatch,
  })
  const report = {
    checked: stale.length,
    updated: 0,
    gone: 0,
    failed: 0,
  }

  for (const event of stale) {
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
        await Repo.putEvent(ctx.store, {
          ...event,
          ...resolution.event,
          status: "live",
          checkedAt,
        })
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

  const site = siteOf(request)

  if (!site) {
    return error(400, "The request names no host.")
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

  const site = siteOf(request)

  if (!site) {
    return error(400, "The request names no host.")
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
