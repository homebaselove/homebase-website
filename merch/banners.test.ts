import { expect, test } from "bun:test"
import {
  Banners,
  coversAvatar,
  Display,
  type Format,
  Formats,
  layout,
  logoInk,
  type Metrics,
} from "./banners.ts"

const logo = await Bun
  .file(
    new URL("../brand/logo/svg/homebase-horizontal-white.svg", import.meta.url),
  )
  .text()

const ink = logoInk(logo)

/** Lato Bold’s proportions, near enough to test the rules with. */
const metrics = (format: Format, lines: readonly string[]): Metrics => ({
  cap: format.size * 0.72,
  lines: lines.map((line) => ({
    width: format.size * 0.55 * line.length,
    left: format.size * 0.05,
    descent: format.size * 0.12,
  })),
})

const format = (name: string) => Formats.find((f) => f.name === name)!

test("the logo is the kit’s horizontal lockup, inked one unit inside its box", () => {
  expect(
    ink,
  )
    .toEqual({
      viewWidth: 1318,
      viewHeight: 150,
      left: 1,
      top: 1,
      bottom: 149,
    })
})

test("every banner has its headline set for every format", () => {
  for (const banner of Banners) {
    expect(
      Formats.every((f) => banner.lines[f.name]?.length > 0),
    )
      .toBe(true)
  }
})

test("the copy follows the kit’s voice", () => {
  const copy = Banners
    .flatMap((banner) => Object.values(banner.lines).flat())
    .join(" ")

  expect(
    copy,
  )
    .toContain("$home")

  expect(
    copy,
  )
    .not
    .toMatch(/\$Home|\$HOME|Homebase|HomeBase/)
})

test("the logo’s ink and the headline’s ink start on the same margin", () => {
  const f = format("1200x630")
  const text = ["Based House", "Mumbai"]
  const m = metrics(f, text)
  const placed = layout(f, text, m, ink)
  const scale = placed.logo.height / ink.viewHeight

  expect(
    placed.logo.x + ink.left * scale,
  )
    .toBeCloseTo(placed.margin, 9)

  expect(
    placed.logo.y + ink.top * scale,
  )
    .toBeCloseTo(placed.margin, 9)

  expect(
    placed.lines.map((line, index) => line.x + m.lines[index].left),
  )
    .toEqual([
      placed.margin,
      placed.margin,
    ])
})

test("the link preview headline ends on the bottom margin", () => {
  const f = format("1200x630")
  const text = ["Welcome", "$home"]
  const placed = layout(f, text, metrics(f, text), ink)

  expect(
    placed.lines.at(-1)!.baseline,
  )
    .toBeCloseTo(f.height - placed.margin, 9)

  expect(
    placed.lines[1].baseline - placed.lines[0].baseline,
  )
    .toBeCloseTo(f.size * Display.lineHeight, 9)
})

test("the X header headline is centred and clear of X’s avatar", () => {
  const f = format("1500x500")

  for (const banner of Banners) {
    const text = banner.lines[f.name]
    const m = metrics(f, text)
    const placed = layout(f, text, m, ink)

    expect(
      placed.lines[0].baseline - m.cap / 2,
    )
      .toBeCloseTo(f.height / 2, 9)

    expect(
      coversAvatar(placed, m),
    )
      .toBe(false)
  }
})

test("a headline on the bottom margin of the X header would run under the avatar", () => {
  const f = {
    ...format("1500x500"),
    anchor: "bottom" as const,
  }
  const text = ["Welcome $home"]
  const m = metrics(f, text)

  expect(
    coversAvatar(layout(f, text, m, ink), m),
  )
    .toBe(true)
})
