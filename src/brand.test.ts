import { expect, test } from "bun:test"
import * as NPath from "node:path"
import { BrandKitUrl, BrandKitZipUrl } from "./brand.ts"

const Public = NPath.join(import.meta.dir, "..", "public")

// The footer links the deck and the deck names the zip, so both must ship.
test("the brand kit deck and zip are served from public", async () => {
  expect(
    await Bun.file(NPath.join(Public, BrandKitUrl)).exists(),
  )
    .toBe(true)

  expect(
    await Bun.file(NPath.join(Public, BrandKitZipUrl)).exists(),
  )
    .toBe(true)
})

test("the brand kit deck is a PDF", async () => {
  const head = await Bun.file(NPath.join(Public, BrandKitUrl)).slice(0, 5).text()

  expect(
    head,
  )
    .toBe("%PDF-")
})
