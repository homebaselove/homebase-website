import { FetchHttpClient } from "@effect/platform"
import { Layer } from "effect"
import { BunTailwindPlugin, Start } from "effect-start"
import * as BunUuidPlugin from "./BunUuidPlugin.ts"
import * as HomeRoute from "./HomeRoute.ts"
import IndexHtml from "./index.html" with { type: "file" }
import * as VendorRoute from "./map/vendorRoute.ts"
import * as Telemetry from "./Telemetry"
import * as WalletRoute from "./wallet/walletRoute.ts"

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
    VendorRoute.layer,
    WalletRoute.layer,
    HomeRoute.layer,
  )
  .pipe(
    Layer.provide([
      Telemetry.layer(),
      FetchHttpClient.layer,
    ]),
  )

if (import.meta.main) {
  Start.serve(() => import("./server"))
}
