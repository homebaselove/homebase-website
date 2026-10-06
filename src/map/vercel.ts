/**
 * The Vercel functions' side of the map: each function hands its request to
 * the shared handler. There is nothing to open first; the registry is on
 * Base and Luma is on the web.
 */
import { type Context, handle, type Route } from "./api.ts"

const context: Context = {
  env: process.env,
  fetch: globalThis.fetch,
  now: () => new Date(),
}

/** A function's handler for one of the map's routes. */
export function handler(route: Route) {
  return (request: Request): Promise<Response> =>
    handle(request, route, context)
}
