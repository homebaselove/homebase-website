import { expect, test } from "bun:test"
import {
  Banners,
  bannerSvg,
  clearOfLogo,
  coversAvatar,
  type Format,
  Formats,
  headlineInk,
  insideMargin,
  layout,
  LinkPreview,
  Lockups,
  type Metrics,
  PrintBanner,
  XHeader,
} from "./headline-banners.ts"
import { CssPerInch, logoInk } from "./render.ts"

const logo = await Bun
  .file(
    new URL("../brand/logo/svg/homebase-horizontal-white.svg", import.meta.url),
  )
  .text()

const ink = logoInk(logo)

const mark = logoInk(
  await Bun
    .file(
      new URL("../brand/logo/svg/homebase-mark-white.svg", import.meta.url),
    )
    .text(),
)

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

test("the house mark is the kit’s, inked one unit inside its box", () => {
  expect(
    mark,
  )
    .toEqual({
      viewWidth: 70,
      viewHeight: 70,
      left: 1,
      right: 69,
      top: 1,
      bottom: 69,
    })
})

test("Welcome $home carries the house mark alone, Based House Mumbai the full logo", () => {
  expect(
    Object.fromEntries(Banners.map((banner) => [banner.slug, banner.logo])),
  )
    .toEqual({
      "welcome-home": "mark",
      "based-house-mumbai": "horizontal",
    })
})

test("the house mark is drawn larger than the house in the full logo", () => {
  for (const format of Formats) {
    const m = metrics(format, "Welcome $home")
    const alone = layout(format, m, "mark", mark).logoInk
    const full = layout(format, m, "horizontal", ink).logoInk

    expect(
      alone.bottom - alone.top,
    )
      .toBeCloseTo(format.height * Lockups.mark.share, 9)

    expect(
      alone.bottom - alone.top,
    )
      .toBeGreaterThan(full.bottom - full.top)

    expect(
      [
        alone.left,
        alone.top,
      ],
    )
      .toEqual([
        full.left,
        full.top,
      ])
  }
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
    const placed = layout(
      format,
      metrics(format, "Welcome $home"),
      "horizontal",
      ink,
    )

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
      const placed = layout(format, m, "horizontal", ink)
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
  const format = LinkPreview
  const fits = metrics(format, "Welcome $home")
  const tooWide = {
    ...fits,
    right: format.width,
  }

  expect(
    insideMargin(format, layout(format, fits, "horizontal", ink), fits),
  )
    .toBe(true)

  expect(
    insideMargin(format, layout(format, tooWide, "horizontal", ink), tooWide),
  )
    .toBe(false)
})

test("a centred headline keeps out of the logo’s clear space, one under it does not", () => {
  for (const format of Formats) {
    const m = metrics(format, "Welcome $home")
    const placed = layout(format, m, "horizontal", ink)

    expect(
      clearOfLogo(placed, m),
    )
      .toBe(true)

    expect(
      clearOfLogo(layout(format, m, "mark", mark), m),
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
  const format = XHeader

  for (const banner of Banners) {
    const m = metrics(format, banner.headline)

    expect(
      coversAvatar(layout(format, m, "horizontal", ink), m),
    )
      .toBe(false)
  }
})

test("a headline low on the left of the X header would run under the avatar", () => {
  const format = XHeader
  const m = metrics(format, "Welcome $home")
  const placed = layout(format, m, "horizontal", ink)

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

test("the print banner is 3 × 6 ft at actual size, with half an inch of bleed", () => {
  const print = Formats.filter((f) => f.print)

  expect(
    print.map((f) => ({
      name: f.name,
      inches: [
        f.width / CssPerInch,
        f.height / CssPerInch,
      ],
      bleed: f.print!.bleed,
    })),
  )
    .toEqual([
      {
        name: "banner-3x6ft",
        inches: [
          72,
          36,
        ],
        bleed: 0.5,
      },
    ])
})

test("bleed widens the blue on every side without moving the art", () => {
  const format = PrintBanner
  const placed = layout(format, metrics(format, "Welcome $home"), "mark", mark)
  const bleed = 0.5 * CssPerInch
  const trim = bannerSvg(format, placed, "Welcome $home", logo)
  const bled = bannerSvg(format, placed, "Welcome $home", logo, bleed)
  const art = (svg: string) => svg.slice(svg.indexOf("/>") + 2)

  expect(
    bled,
  )
    .toContain(
      `width="${format.width + 2 * bleed}" height="${
        format.height + 2 * bleed
      }" viewBox="${-bleed} ${-bleed} ${format.width + 2 * bleed} ${
        format.height + 2 * bleed
      }"`,
    )

  expect(
    bled,
  )
    .toContain(
      `<rect x="${-bleed}" y="${-bleed}" width="${
        format.width + 2 * bleed
      }" height="${format.height + 2 * bleed}"`,
    )

  expect(
    art(bled),
  )
    .toBe(art(trim))
})

test("the social sizes are the kit’s own, named as the kit names them", async () => {
  for (const format of [XHeader, LinkPreview]) {
    const png = new DataView(
      await Bun
        .file(
          new URL(
            `../brand/social/homebase-${format.name}.png`,
            import.meta.url,
          ),
        )
        .arrayBuffer(),
    )

    expect(
      [
        png.getUint32(16),
        png.getUint32(20),
      ],
    )
      .toEqual([
        format.width,
        format.height,
      ])
  }
})
