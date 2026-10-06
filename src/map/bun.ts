/**
 * The Bun server's side of the map: pins live in its SQLite file through the
 * Effect SqlClient, or in Turso when the same database should be shared with
 * the Vercel deploy. Each route hands its request to the shared handler.
 */
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { createClient } from "@libsql/client/web"
import { Config, Effect, Option } from "effect"
import { type Context, handle, type Route } from "./api.ts"
import * as Repo from "./store.ts"
import type { Row, Store } from "./store.ts"

export function sqlClientStore(sql: SqlClient.SqlClient): Store {
  return {
    run: (query, params = []) =>
      Effect.runPromise(
        sql.unsafe<Row>(query, [
          ...params,
        ]),
      ),
  }
}

let remote: Promise<Store> | null = null

/**
 * Turso when TURSO_DATABASE_URL is set, so one database serves every deploy;
 * the local file otherwise. The remote schema is made sure of once.
 */
const store: Effect.Effect<Store, never, SqlClient.SqlClient> = Effect
  .gen(function*() {
    const url = yield* Config
      .option(Config.nonEmptyString("TURSO_DATABASE_URL"))
      .pipe(Effect.orDie)

    if (Option.isSome(url)) {
      const token = yield* Config
        .option(Config.nonEmptyString("TURSO_AUTH_TOKEN"))
        .pipe(Effect.orDie)

      remote ??= (async () => {
        const client = Repo.libsqlStore(
          createClient({
            url: url.value,
            authToken: Option.getOrUndefined(token),
          }),
        )

        await Repo.ensureSchema(client)

        return client
      })()
      remote.catch(() => {
        remote = null
      })

      return yield* Effect.promise(() => remote!)
    }

    return sqlClientStore(yield* SqlClient.SqlClient)
  })

export const context: Effect.Effect<Context, never, SqlClient.SqlClient> =
  Effect.map(store, (store) => ({
    store,
    env: process.env,
    fetch: globalThis.fetch,
    now: () => new Date(),
  }))

/** A file route's handler: the request in, the shared handler's answer out. */
export function handler(route: Route) {
  return Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const ctx = yield* context
    const response = yield* Effect.promise(() =>
      handle(request.source as Request, route, ctx)
    )
    const bytes = yield* Effect.promise(() => response.arrayBuffer())
    const headers = Object.fromEntries(response.headers)
    const contentType = headers["content-type"]

    delete headers["content-type"]

    return HttpServerResponse.uint8Array(new Uint8Array(bytes), {
      status: response.status,
      headers,
      contentType,
    })
  })
}
