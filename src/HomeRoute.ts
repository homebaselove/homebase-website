import { HttpRouter } from "@effect/platform"
import { Effect, Layer } from "effect"
import { BundleHttp } from "effect-start"

/**
 * The home page for any query string. The bundle's own catch-all reads the
 * query into the file name it looks for, which turned `/?event=…` links, and
 * the parameters a mini app host adds, into a 404 on the Bun server.
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function*() {
    const router = yield* HttpRouter.Default

    yield* router.get("/", BundleHttp.entrypoint("index.html"))
  }),
)
