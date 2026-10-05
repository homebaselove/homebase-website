import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { RouteNotFound } from "@effect/platform/HttpServerError"
import { Effect, Layer } from "effect"
import * as NPath from "node:path"
import * as NUrl from "node:url"
import { MapLibreVersion, VendorDir, VendorFiles } from "./vendor.ts"

const dist = NPath.dirname(
  NUrl.fileURLToPath(import.meta.resolve("maplibre-gl/dist/maplibre-gl.mjs")),
)

const types: Record<string, string> = {
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
}

/** Serves MapLibre's files from the package, as the Vercel build copies them. */
export const app = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const path = request.url.split("?")[0].replace(/^\/vendor/, "")
  const file = VendorFiles.find((name) =>
    path === `/maplibre-gl@${MapLibreVersion}/${name}`
  )

  if (!file) {
    return yield* Effect.fail(
      new RouteNotFound({
        request,
      }),
    )
  }

  const bytes = yield* Effect.promise(() =>
    Bun.file(NPath.join(dist, file)).bytes()
  )

  return HttpServerResponse.uint8Array(bytes, {
    contentType: types[NPath.extname(file)],
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
})

export const layer = Layer.effectDiscard(
  Effect.gen(function*() {
    const router = yield* HttpRouter.Default

    yield* router.mountApp(
      VendorDir.split("/").slice(0, 2).join("/") as `/${string}`,
      app,
    )
  }),
)
