import { expect, test } from "bun:test"
import * as NPath from "node:path"
import VercelConfig from "../vercel.json" with { type: "json" }
import { BrandKitFile, BrandKitUrl, BrandKitZipUrl } from "./brand.ts"

const Public = NPath.join(import.meta.dir, "..", "public")

// The footer links the deck and the deck names the zip, so both must ship.
test("the brand kit deck and zip are served from public", async () => {
  expect(
    await Bun.file(NPath.join(Public, BrandKitFile)).exists(),
  )
    .toBe(true)

  expect(
    await Bun.file(NPath.join(Public, BrandKitZipUrl)).exists(),
  )
    .toBe(true)
})

// Vercel takes the first rewrite that matches, so the brand kit must come before the catch-all that serves the page.
test("Vercel serves the deck at the brand kit address", () => {
  const rewrites = VercelConfig.rewrites.map((rewrite) => rewrite.source)

  expect(
    VercelConfig.rewrites.find((rewrite) => rewrite.source === BrandKitUrl),
  )
    .toEqual({
      source: BrandKitUrl,
      destination: BrandKitFile,
    })

  expect(
    rewrites.indexOf(BrandKitUrl),
  )
    .toBeLessThan(rewrites.indexOf("/(.*)"))
})
