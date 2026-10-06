import { expect, test } from "bun:test"
import MapLibre from "maplibre-gl/package.json" with { type: "json" }
import { MapLibreVersion, VendorFiles } from "./vendor.ts"

test("the vendored MapLibre is the installed one", async () => {
  expect(
    MapLibreVersion,
  )
    .toBe(MapLibre.version)

  for (const file of VendorFiles) {
    expect(
      await Bun.file(`node_modules/maplibre-gl/dist/${file}`).exists(),
    )
      .toBe(true)
  }
})
