import { FetchHttpClient, HttpClient, HttpRouter } from "@effect/platform"
import { Console, Effect, Layer } from "effect"
import { BunTailwindPlugin, Start } from "effect-start"
import * as BunUuidPlugin from "./BunUuidPlugin.ts"
import * as Sql from "./db/Sql"
import IndexHtml from "./index.html" with { type: "file" }
import * as CalendarSync from "./jobs/CalendarSync"
import * as Telemetry from "./Telemetry"

export default Layer
  .mergeAll(
    Start.router(() => import("./routes/_manifest")),
    Start.bundleClient({
      entrypoints: [
        IndexHtml,
      ],
      plugins: [
        BunTailwindPlugin.make(),
        BunUuidPlugin.make(),
      ],
    }),
    CalendarSync.layer(),
    Sql.SqlLive,
    Sql.SqlMigrator,
  )
  .pipe(
    Layer.provide([
      // we need to provide sql again for CalendarSync

      Sql.SqlLive,
      Sql.SqlMigrator,
      Telemetry.layer(),

      FetchHttpClient.layer,
    ]),
  )

if (import.meta.main) {
  Start.serve(() => import("./server"))
}
