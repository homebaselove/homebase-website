import { HttpRouter } from "@effect/platform"
import { Effect, Layer } from "effect"
import { BundleHttp } from "effect-start"
import { Pages } from "./routes/_manifest.ts"

/**
 * The page for each route the client renders, the home page and /learn, for
 * any query string. The bundle's own catch-all reads the query into the file
 * name it looks for, which turned `/?event=…` links, and the parameters a mini
 * app host adds, into a 404 on the Bun server, and it knows no page but the
 * home page. Vercel rewrites every such path to the same index.html.
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function*() {
    const router = yield* HttpRouter.Default

    for (const page of Pages) {
      // The bundle is in the app's context at request time, as it is for the
      // bundle's own routes; the Default router's type does not carry it.
      yield* router.get(
        page.path,
        BundleHttp.entrypoint("index.html") as unknown as Parameters<
          typeof router.get
        >[1],
      )
    }
  }),
)
