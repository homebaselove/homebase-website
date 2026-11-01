import { expect, test } from "bun:test"
import {
  LogoShare,
  OpticalLift,
  placeLogo,
  posterSvg,
  PxPerUnit,
  Sheets,
} from "./poster.ts"
import { logoInk } from "./print.ts"

const logo = await Bun
  .file(
    new URL("../brand/logo/svg/homebase-stacked-white.svg", import.meta.url),
  )
  .text()

const ink = logoInk(logo)

test("the poster comes in tabloid and A3, each with its usual bleed", () => {
  expect(
    Sheets.map(({ name, width, height, unit, bleed }) => ({
      name,
      size: `${width} × ${height} ${unit}`,
      bleed: `${bleed} ${unit}`,
    })),
  )
    .toEqual([
      {
        name: "11x17in",
        size: "11 × 17 in",
        bleed: "0.125 in",
      },
      {
        name: "a3",
        size: "297 × 420 mm",
        bleed: "3 mm",
      },
    ])
})

test("the logo is centred across, sized to the sheet and raised a little", () => {
  for (const sheet of Sheets) {
    const px = PxPerUnit[sheet.unit]
    const width = sheet.width * px
    const height = sheet.height * px
    const placed = placeLogo(sheet, ink).ink

    expect(
      (placed.left + placed.right) / 2,
    )
      .toBeCloseTo(width / 2, 9)

    expect(
      placed.right - placed.left,
    )
      .toBeCloseTo(width * LogoShare, 9)

    expect(
      (placed.top + placed.bottom) / 2,
    )
      .toBeCloseTo(height / 2 - height * OpticalLift, 9)
  }
})

test("the logo keeps the kit’s clear space, a fifth of its height, on every side", () => {
  for (const sheet of Sheets) {
    const px = PxPerUnit[sheet.unit]
    const placed = placeLogo(sheet, ink).ink
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
})

test("bleed widens the blue on every side without moving the logo", () => {
  for (const sheet of Sheets) {
    const trim = posterSvg(sheet, logo, ink)
    const bled = posterSvg(sheet, logo, ink, sheet.bleed)
    const art = (svg: string) => svg.slice(svg.indexOf("/>") + 2)
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
})
