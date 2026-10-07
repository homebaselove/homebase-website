/** The Vercel functions' side of Homebase Live: each hands its request to the shared handler. */
import { type Context, handle, type Route } from "./api.ts"

const context: Context = {
  env: process.env,
  fetch: globalThis.fetch,
  now: () => new Date(),
}

export function handler(route: Route) {
  return (request: Request): Promise<Response> =>
    handle(request, route, context)
}
