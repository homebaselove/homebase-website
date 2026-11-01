import { expect, test } from "bun:test"
import {
  Banners,
  clearOfLogo,
  coversAvatar,
  type Format,
  Formats,
  headlineInk,
  insideMargin,
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
const metrics = (format: Format, headline: string): Metrics => ({
  cap: format.size * 0.72,
  left: format.size * 0.05,
  right: format.size * 0.53 * headline.length,
  descent: format.size * 0.12,
})

test("the logo is the kit’s horizontal lockup, inked one unit inside its box", () => {
  expect(
    {
      viewWidth: ink.viewWidth,
      viewHeight: ink.viewHeight,
      left: ink.left,
      right: Math.round(ink.right),
      top: ink.top,
      bottom: ink.bottom,
    },
  )
    .toEqual({
      viewWidth: 1318,
      viewHeight: 150,
      left: 1,
      right: 1317,
      top: 1,
      bottom: 149,
    })
})

test("the copy follows the kit’s voice", () => {
  const copy = Banners
    .map((banner) => banner.headline)
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

test("the logo’s ink sits on the top and left margins", () => {
  for (const format of Formats) {
    const placed = layout(format, metrics(format, "Welcome $home"), ink)

    expect(
      [
        placed.logoInk.left,
        placed.logoInk.top,
      ],
    )
      .toEqual([
        placed.margin,
        placed.margin,
      ])
  }
})

test("the headline’s ink is centred across and its cap height down", () => {
  for (const format of Formats) {
    for (const banner of Banners) {
      const m = metrics(format, banner.headline)
      const placed = layout(format, m, ink)
      const box = headlineInk(placed, m)

      expect(
        (box.left + box.right) / 2,
      )
        .toBeCloseTo(format.width / 2, 9)

      expect(
        (box.top + placed.headline.baseline) / 2,
      )
        .toBeCloseTo(format.height / 2, 9)
    }
  }
})

test("a headline wider than the space between the margins is caught", () => {
  const format = Formats.find((f) => f.name === "1200x630")!
  const fits = metrics(format, "Welcome $home")
  const tooWide = {
    ...fits,
    right: format.width,
  }

  expect(
    insideMargin(format, layout(format, fits, ink), fits),
  )
    .toBe(true)

  expect(
    insideMargin(format, layout(format, tooWide, ink), tooWide),
  )
    .toBe(false)
})

test("a centred headline keeps out of the logo’s clear space, one under it does not", () => {
  for (const format of Formats) {
    const m = metrics(format, "Welcome $home")
    const placed = layout(format, m, ink)

    expect(
      clearOfLogo(placed, m),
    )
      .toBe(true)

    expect(
      clearOfLogo({
        ...placed,
        headline: {
          x: placed.margin,
          baseline: placed.logoInk.bottom + m.cap,
        },
      }, m),
    )
      .toBe(false)
  }
})

test("the X header headlines stay clear of X’s avatar", () => {
  const format = Formats.find((f) => f.name === "1500x500")!

  for (const banner of Banners) {
    const m = metrics(format, banner.headline)

    expect(
      coversAvatar(layout(format, m, ink), m),
    )
      .toBe(false)
  }
})

test("a headline low on the left of the X header would run under the avatar", () => {
  const format = Formats.find((f) => f.name === "1500x500")!
  const m = metrics(format, "Welcome $home")
  const placed = layout(format, m, ink)

  expect(
    coversAvatar({
      ...placed,
      headline: {
        x: placed.margin,
        baseline: format.height - placed.margin,
      },
    }, m),
  )
    .toBe(true)
})
