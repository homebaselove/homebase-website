/**
 * The Vercel functions' side of the map: pins live in Turso, reached over
 * HTTP, since a function has no disk. The store is opened once per instance.
 */
import { createClient } from "@libsql/client/web"
import { type Context, handle, json, type Route } from "./api.ts"
import * as Repo from "./store.ts"

let opening: Promise<Context> | null = null

function context(): Promise<Context> {
  opening ??= (async () => {
    const url = process.env.TURSO_DATABASE_URL

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is not set")
    }

    const store = Repo.libsqlStore(
      createClient({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN || undefined,
      }),
    )

    await Repo.ensureSchema(store)

    return {
      store,
      env: process.env,
      fetch: globalThis.fetch,
      now: () => new Date(),
    }
  })()
  opening.catch(() => {
    opening = null
  })

  return opening
}

/** A function's handler for one of the map's routes. */
export function handler(route: Route) {
  return async (request: Request): Promise<Response> => {
    let ctx: Context

    try {
      ctx = await context()
    } catch (error) {
      console.error("The map's store is not available:", error)

      return json(
        {
          error: process.env.TURSO_DATABASE_URL
            ? "The map's store couldn't be reached. The deployment's logs say why."
            : "The map's store isn't set up on this deployment: TURSO_DATABASE_URL is missing.",
        },
        503,
      )
    }

    return handle(request, route, ctx)
  }
}
