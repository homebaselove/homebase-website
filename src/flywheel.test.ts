import { expect, test } from "bun:test"
import * as NPath from "node:path"
import {
  BasedHouseMumbaiApplyUrl,
  DonationAddress,
  DonationName,
} from "./funding.ts"
import { FlywheelUrl } from "./ui/Flywheel.tsx"

const document = () =>
  Bun
    .file(NPath.join(import.meta.dir, "..", "public", FlywheelUrl))
    .text()

test("the flywheel /learn frames is served from public", async () => {
  expect(
    await Bun
      .file(NPath.join(import.meta.dir, "..", "public", FlywheelUrl))
      .exists(),
  )
    .toBe(true)
})

// The flywheel was built for SeedMe with its own residency form; on this
// site every Apply opens the one form the funding card and the story use.
test("the flywheel applies through the same form as the rest of the site", async () => {
  expect(
    [
      ...new Set((await document()).match(/https:\/\/forms\.gle\/[\w-]+/g)),
    ],
  )
    .toEqual([
      BasedHouseMumbaiApplyUrl,
    ])
})

// The document forces its light theme, so its light tokens are the ones shown.
test("the flywheel shows its light theme in the site blue", async () => {
  const html = await document()
  const light = html.match(/:root\[data-theme="light"\]\{([^}]*)\}/)?.[1] ?? ""

  expect(
    [
      html.startsWith("<html lang=\"en\" data-theme=\"light\">"),
      light.includes("--accent:#0000ff;"),
      light.includes("--series:#0000ff;"),
    ],
  )
    .toEqual([
      true,
      true,
      true,
    ])
})

// The flywheel names the address to donate to; the Donate button sends there.
test("the flywheel asks for donations where Donate sends them", async () => {
  const html = await document()

  expect(
    [
      html.match(/<code id="addr">(0x[0-9a-fA-F]{40})<\/code>/)?.[1],
      html.includes(`<b>${DonationName}</b>`),
    ],
  )
    .toEqual([
      DonationAddress,
      true,
    ])
})
