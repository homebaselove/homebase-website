import { expect, test } from "bun:test"
import * as NPath from "node:path"
import { DonationAddress, DonationName } from "./funding.ts"
import { WelcomeToBasedHouseUrl } from "./story.ts"
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

// Learn shows the wheel and then the ways to take part, without the notes
// on reading the wheel that SeedMe puts between them.
test("the flywheel leaves out How to read it", async () => {
  expect(
    /<h2[^>]*>How to read it<\/h2>/.test(await document()),
  )
    .toBe(false)
})

// The flywheel was built for SeedMe with its own residency form; on this
// site the post the story leads its Mumbai chapter with stands where Apply
// was, and no application form is left.
test("the flywheel welcomes people to Based House where it asked them to apply", async () => {
  const html = await document()

  expect(
    {
      forms: html.match(/https:\/\/forms\.gle\/[\w-]+/g),
      welcome: html.includes(
        `<a class="btn primary" href="${WelcomeToBasedHouseUrl}" target="_blank" rel="noreferrer">Welcome to Based House</a>`,
      ),
    },
  )
    .toEqual({
      forms: null,
      welcome: true,
    })
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
