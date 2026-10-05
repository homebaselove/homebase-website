import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { RouteNotFound } from "@effect/platform/HttpServerError"
import { Effect, Layer } from "effect"
import * as NPath from "node:path"
import { buildWallet, WalletDir, WalletEntry } from "./build.ts"

/**
 * Serves the wallet bundle on the Bun server, built in memory when the
 * server starts, as the Vercel build writes the same files to dist/wallet.
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function*() {
    const router = yield* HttpRouter.Default
    const files = new Map<string, Uint8Array>()

    for (const artifact of yield* Effect.promise(() => buildWallet())) {
      files.set(
        NPath.basename(artifact.path),
        new Uint8Array(yield* Effect.promise(() => artifact.arrayBuffer())),
      )
    }

    const app = Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const name = request.url.split("?")[0].replace(/^\//, "")
      const bytes = files.get(name)

      if (!bytes || !name.endsWith(".js")) {
        return yield* Effect.fail(
          new RouteNotFound({
            request,
          }),
        )
      }

      return HttpServerResponse.uint8Array(bytes, {
        contentType: "text/javascript; charset=utf-8",
        headers: {
          // The entry keeps its name across builds; the chunks beside it are hashed.
          "cache-control": name === WalletEntry
            ? "public, max-age=0, must-revalidate"
            : "public, max-age=31536000, immutable",
        },
      })
    })

    yield* router.mountApp(WalletDir, app)
  }),
)
