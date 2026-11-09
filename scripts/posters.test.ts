import { expect, test } from "bun:test"
import {
  OpticalLift,
  placeLogo,
  Posters,
  posterSvg,
  PxPerUnit,
} from "./posters.ts"
import { logoInk } from "./render.ts"

const logos = Object.fromEntries(
  await Promise.all(
    Posters.map(async (poster) => {
      const svg = await Bun
        .file(new URL(`../brand/logo/svg/${poster.logo}`, import.meta.url))
        .text()

      return [poster.slug, {
        svg,
        ink: logoInk(svg),
      }]
    }),
  ),
)

test("each poster carries its kit logo in its sizes, each with the usual bleed", () => {
  expect(
    Posters.map((poster) => ({
      slug: poster.slug,
      logo: poster.logo,
      sheets: poster.sheets.map(({ name, width, height, unit, bleed }) =>
        `${name}: ${width} × ${height} ${unit}, ${bleed} ${unit} bleed`
      ),
    })),
  )
    .toEqual([
      {
        slug: "homebase-poster",
        logo: "homebase-stacked-white.svg",
        sheets: [
          "11x17in: 11 × 17 in, 0.125 in bleed",
          "a3: 297 × 420 mm, 3 mm bleed",
        ],
      },
      {
        slug: "homebase-mark-poster",
        logo: "homebase-mark-white.svg",
        sheets: [
          "a3: 297 × 420 mm, 3 mm bleed",
          "a4: 210 × 297 mm, 3 mm bleed",
        ],
      },
    ])
})

test("the logo is centred across, sized to the sheet and raised a little", () => {
  for (const poster of Posters) {
    for (const sheet of poster.sheets) {
      const px = PxPerUnit[sheet.unit]
      const width = sheet.width * px
      const height = sheet.height * px
      const placed = placeLogo(sheet, logos[poster.slug].ink, poster.share).ink

      expect(
        (placed.left + placed.right) / 2,
      )
        .toBeCloseTo(width / 2, 9)

      expect(
        placed.right - placed.left,
      )
        .toBeCloseTo(width * poster.share, 9)

      expect(
        (placed.top + placed.bottom) / 2,
      )
        .toBeCloseTo(height / 2 - height * OpticalLift, 9)
    }
  }
})

test("the logo keeps the kit’s clear space, a fifth of its height, on every side", () => {
  for (const poster of Posters) {
    for (const sheet of poster.sheets) {
      const px = PxPerUnit[sheet.unit]
      const placed = placeLogo(sheet, logos[poster.slug].ink, poster.share).ink
      const clear = (placed.bottom - placed.top) / 5

      expect(
        Math.min(
          placed.left,
          placed.top,
          sheet.width * px - placed.right,
          sheet.height * px - placed.bottom,
        ),
      )
        .toBeGreaterThan(clear)
    }
  }
})

test("bleed widens the blue on every side without moving the logo", () => {
  for (const poster of Posters) {
    const { svg, ink } = logos[poster.slug]

    for (const sheet of poster.sheets) {
      const trim = posterSvg(sheet, svg, ink, poster.share)
      const bled = posterSvg(sheet, svg, ink, poster.share, sheet.bleed)
      const art = (markup: string) => markup.slice(markup.indexOf("/>") + 2)
      const pad = sheet.bleed * PxPerUnit[sheet.unit]

      expect(
        bled,
      )
        .toContain(`viewBox="${-pad} ${-pad} `)

      expect(
        art(bled),
      )
        .toBe(art(trim))
    }
  }
})
