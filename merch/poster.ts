/// <reference lib="dom" />
/**
 * Posters of the Homebase logo, white and centred on Homebase Blue: the
 * brand kit’s stacked lockup, its primary logo, at the standard small poster
 * sizes, 11 × 17 in (tabloid) in the US and A3 elsewhere; and the house mark
 * alone, without the wordmark, at A3 and A4.
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

/** US tabloid, the step up from letter, with the ⅛ in bleed US shops ask for. */
export const Tabloid: Sheet = {
  name: "11x17in",
  width: 11,
  height: 17,
  unit: "in",
  bleed: 0.125,
}

/** ISO A3 and A4, with the 3 mm bleed shops on A sizes ask for. */
export const A3: Sheet = {
  name: "a3",
  width: 297,
  height: 420,
  unit: "mm",
  bleed: 3,
}

export const A4: Sheet = {
  name: "a4",
  width: 210,
  height: 297,
  unit: "mm",
  bleed: 3,
}

export interface Poster {
  /** File names start with this. */
  slug: string
  /** The kit’s logo file, white, from brand/logo/svg. */
  logo: string
  /** The logo’s ink width, as a share of the sheet’s width. */
  share: number
  sheets: Sheet[]
}

export const Posters: Poster[] = [
  {
    slug: "homebase-poster",
    logo: "homebase-stacked-white.svg",
    share: 0.7,
    sheets: [Tabloid, A3],
  },
  // The house is square, so it stands narrower than the stacked lockup to
  // keep as much blue around it.
  {
    slug: "homebase-mark-poster",
    logo: "homebase-mark-white.svg",
    share: 0.55,
    sheets: [A3, A4],
  },
]

export const PxPerUnit = {
  in: CssPerInch,
  mm: CssPerInch / 25.4,
}

/**
 * How far above the middle the logo sits, as a share of the sheet’s height:
 * a mark centred exactly looks low.
 */
export const OpticalLift = 0.03

/** Where the logo’s viewBox goes on the sheet, and where its ink lands, in px. */
export function placeLogo(sheet: Sheet, ink: LogoInk, share: number) {
  const px = PxPerUnit[sheet.unit]
  const width = sheet.width * px
  const height = sheet.height * px
  const scale = (width * share) / (ink.right - ink.left)
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
  share: number,
  bleed = 0,
) {
  const px = PxPerUnit[sheet.unit]
  const pad = bleed * px
  const width = sheet.width * px + 2 * pad
  const height = sheet.height * px + 2 * pad

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-pad} ${-pad} ${width} ${height}" style="display:block">`
    + `<rect x="${-pad}" y="${-pad}" width="${width}" height="${height}" fill="${colors.blue.hex}"/>`
    + nest(logoSvg, placeLogo(sheet, ink, share).box)
    + `</svg>`
}

if (import.meta.main) {
  const { chromium } = await import("playwright")
  const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))
  const OutDir = NPath.join(Here, "poster")

  await NFs.mkdir(OutDir, {
    recursive: true,
  })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // A hairline at the trim prints blue, never white.
  await page.setContent(
    `<style>@page{margin:0}html,body{margin:0;background:${colors.blue.hex}}</style>`,
  )

  for (const poster of Posters) {
    const logoSvg = await Bun
      .file(NPath.join(Here, "../brand/logo/svg", poster.logo))
      .text()
    const ink = logoInk(logoSvg)

    for (const sheet of poster.sheets) {
      for (const bleed of [0, sheet.bleed]) {
        await writePrint(
          page,
          posterSvg(sheet, logoSvg, ink, poster.share, bleed),
          NPath.join(
            OutDir,
            `${poster.slug}-${sheet.name}${bleed ? "-bleed" : ""}`,
          ),
          {
            width: `${sheet.width + 2 * bleed}${sheet.unit}`,
            height: `${sheet.height + 2 * bleed}${sheet.unit}`,
          },
        )
      }
    }
  }

  await browser.close()
  console.log(`Posters written to ${OutDir}`)
}
