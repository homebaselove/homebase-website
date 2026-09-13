import { BunTailwindPlugin } from "effect-start"
import * as NFs from "node:fs/promises"

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

console.log(`Built ${result.outputs.length} files into ${OutDir}/`)
