import { BunTailwindPlugin } from "effect-start"
import MapLibre from "maplibre-gl/package.json" with { type: "json" }
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import * as BunUuidPlugin from "../src/BunUuidPlugin.ts"
import { MapLibreVersion, VendorDir, VendorFiles } from "../src/map/vendor.ts"
import { buildWallet, WalletDir } from "../src/wallet/build.ts"

/**
 * Builds the client into static files for hosts that cannot run the Bun
 * server. `bun dev` still bundles in memory through effect-start; this is the
 * same bundle written to disk.
 */
const OutDir = "dist"

await NFs.rm(OutDir, {
  recursive: true,
  force: true,
})

const result = await Bun.build({
  entrypoints: [
    "./src/index.html",
  ],
  outdir: OutDir,
  target: "browser",
  minify: true,
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    BunTailwindPlugin.make(),
    BunUuidPlugin.make(),
  ],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }

  process.exit(1)
}

await NFs.cp("public", OutDir, {
  recursive: true,
})

/**
 * MapLibre ships as its own files, next to a worker the bundler would not
 * carry across. The Bun server reads them from the package; here they are
 * copied to the path the client loads them from.
 */
if (MapLibre.version !== MapLibreVersion) {
  console.error(
    `src/map/vendor.ts names MapLibre ${MapLibreVersion}, but ${MapLibre.version} is installed`,
  )

  process.exit(1)
}

const vendorDir = NPath.join(OutDir, VendorDir)

await NFs.mkdir(vendorDir, {
  recursive: true,
})

for (const file of VendorFiles) {
  await NFs.copyFile(
    NPath.join("node_modules/maplibre-gl/dist", file),
    NPath.join(vendorDir, file),
  )
}

/** The wallet is its own bundle, fetched by the page when someone presses Connect. */
const wallet = await buildWallet(NPath.join(OutDir, WalletDir))

console.log(
  `Built ${result.outputs.length + wallet.length} files into ${OutDir}/`,
)
