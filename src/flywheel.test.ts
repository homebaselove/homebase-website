import { expect, test } from "bun:test"
import * as NPath from "node:path"
import { BasedHouseMumbaiApplyUrl } from "./funding.ts"
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
