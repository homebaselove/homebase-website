import { HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect, Layer } from "effect"
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import { BrandKitFile, BrandKitUrl } from "./brand.ts"

const PublicDir = NPath.join(import.meta.dir, "..", "public")

/**
 * The files in public at their own paths, as Vercel serves them from dist:
 * the flywheel /learn frames, the interview video, the deck and the share
 * image. Each is streamed from disk rather than read into memory, and the
 * list is read once at start, so no path outside public can be asked for.
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function*() {
    const router = yield* HttpRouter.Default
    const names = yield* Effect.promise(() =>
      NFs.readdir(PublicDir, {
        withFileTypes: true,
      })
    )

    for (const entry of names) {
      if (entry.isFile()) {
        yield* router.get(
          `/${entry.name}`,
          HttpServerResponse.file(NPath.join(PublicDir, entry.name)),
        )
      }
    }

    // The address we give out for the brand kit, as Vercel rewrites it.
    yield* router.get(
      BrandKitUrl,
      HttpServerResponse.file(NPath.join(PublicDir, BrandKitFile)),
    )
  }),
)
