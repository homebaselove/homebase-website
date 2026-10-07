/**
 * The Bun server's side of Homebase Live: each file route hands its request
 * to the shared handler and sends back what comes out.
 */
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { type Context, handle, type Route } from "./api.ts"

const context: Context = {
  env: process.env,
  fetch: globalThis.fetch,
  now: () => new Date(),
}

export function handler(route: Route) {
  return Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const response = yield* Effect.promise(() =>
      handle(request.source as Request, route, context)
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
