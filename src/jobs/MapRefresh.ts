import { Effect, Layer, Schedule } from "effect"
import * as MapApi from "../map/api.ts"
import * as MapBun from "../map/bun.ts"

const refresh = Effect.gen(function*() {
  const ctx = yield* MapBun.context
  const report = yield* Effect.promise(() => MapApi.refreshStale(ctx))

  if (report.checked > 0) {
    yield* Effect.logInfo(
      `Refreshed ${report.checked} map events: ${report.updated} updated, ${report.gone} gone, ${report.failed} failed`,
    )
  }
})

/**
 * Reads Luma again for pins whose reading has aged, every hour. The Vercel
 * deploy does the same from its daily cron.
 */
export function layer() {
  return Layer.scopedDiscard(
    Effect.forkScoped(
      refresh.pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("MapRefresh failed", cause)
        ),
        Effect.delay("1 minute"),
        Effect.repeat(Schedule.spaced("1 hour")),
      ),
    ),
  )
}
