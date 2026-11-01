/// <reference lib="dom" />
/**
 * A poster of the Homebase logo: the brand kit’s stacked lockup, its primary
 * logo, white and centred on Homebase Blue, at the standard small poster
 * sizes, 11 × 17 in (tabloid) in the US and A3 elsewhere.
 *
 *   bun merch/poster.ts
 *
 * Writes merch/poster as vector PDF at actual size, with and without bleed,
 * each with a 300 DPI PNG rasterised from the PDF. Needs pdftoppm (poppler).
 */
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import * as NUrl from "node:url"
import colors from "../brand/colors.json" with { type: "json" }
import {
  type Box,
  CssPerInch,
  type LogoInk,
  logoInk,
  nest,
  writePrint,
} from "./print.ts"

export interface Sheet {
  name: string
  width: number
  height: number
  unit: "in" | "mm"
  /** Bleed past each edge, in the sheet’s unit. */
  bleed: number
}

/**
 * The step up from a sheet of paper: tabloid next to US letter, A3 next to
 * A4, each with the bleed its print shops usually ask for.
 */
export const Sheets: Sheet[] = [
  {
    name: "11x17in",
    width: 11,
    height: 17,
    unit: "in",
    bleed: 0.125,
  },
  {
    name: "a3",
    width: 297,
    height: 420,
    unit: "mm",
    bleed: 3,
  },
]

export const PxPerUnit = {
  in: CssPerInch,
  mm: CssPerInch / 25.4,
}

/** The logo’s ink width, as a share of the sheet’s width. */
export const LogoShare = 0.7

/**
 * How far above the middle the logo sits, as a share of the sheet’s height:
 * a mark centred exactly looks low.
 */
export const OpticalLift = 0.03

/** Where the logo’s viewBox goes on the sheet, and where its ink lands, in px. */
export function placeLogo(sheet: Sheet, ink: LogoInk) {
  const px = PxPerUnit[sheet.unit]
  const width = sheet.width * px
  const height = sheet.height * px
  const scale = (width * LogoShare) / (ink.right - ink.left)
  const inkWidth = (ink.right - ink.left) * scale
  const inkHeight = (ink.bottom - ink.top) * scale
  const inkLeft = (width - inkWidth) / 2
  const inkTop = height / 2 - OpticalLift * height - inkHeight / 2
  const box: Box = {
    x: inkLeft - ink.left * scale,
    y: inkTop - ink.top * scale,
    width: ink.viewWidth * scale,
    height: ink.viewHeight * scale,
  }

  return {
    box,
    ink: {
      left: inkLeft,
      right: inkLeft + inkWidth,
      top: inkTop,
      bottom: inkTop + inkHeight,
    },
  }
}

/**
 * The poster as SVG. `bleed`, in the sheet’s unit, widens the blue on every
 * side without moving the logo: the viewBox starts that far before the trim.
 */
export function posterSvg(
  sheet: Sheet,
  logoSvg: string,
  ink: LogoInk,
  bleed = 0,
) {
  const px = PxPerUnit[sheet.unit]
  const pad = bleed * px
  const width = sheet.width * px + 2 * pad
  const height = sheet.height * px + 2 * pad

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-pad} ${-pad} ${width} ${height}" style="display:block">`
    + `<rect x="${-pad}" y="${-pad}" width="${width}" height="${height}" fill="${colors.blue.hex}"/>`
    + nest(logoSvg, placeLogo(sheet, ink).box)
    + `</svg>`
}

if (import.meta.main) {
  const { chromium } = await import("playwright")
  const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))
  const OutDir = NPath.join(Here, "poster")
  const logoSvg = await Bun
    .file(NPath.join(Here, "../brand/logo/svg/homebase-stacked-white.svg"))
    .text()
  const ink = logoInk(logoSvg)

  await NFs.mkdir(OutDir, {
    recursive: true,
  })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // A hairline at the trim prints blue, never white.
  await page.setContent(
    `<style>@page{margin:0}html,body{margin:0;background:${colors.blue.hex}}</style>`,
  )

  for (const sheet of Sheets) {
    for (const bleed of [0, sheet.bleed]) {
      await writePrint(
        page,
        posterSvg(sheet, logoSvg, ink, bleed),
        NPath.join(
          OutDir,
          `homebase-poster-${sheet.name}${bleed ? "-bleed" : ""}`,
        ),
        {
          width: `${sheet.width + 2 * bleed}${sheet.unit}`,
          height: `${sheet.height + 2 * bleed}${sheet.unit}`,
        },
      )
    }
  }

  await browser.close()
  console.log(`Posters written to ${OutDir}`)
}
