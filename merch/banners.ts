/// <reference lib="dom" />
/**
 * Homebase banners, in the brand kit’s two social sizes, the X header
 * (1500 × 500) and the link preview (1200 × 630), and printed at 3 × 6 ft.
 * Each is a logo from the kit, white, top left, with a headline in Lato Bold
 * centred on Homebase Blue, the way the kit’s own social images are set.
 *
 *   bun merch/banners.ts
 *
 * Writes the social sizes to merch/banners at 1× and 2×, and the print size
 * to merch/banners/print as vector PDF at actual size, with and without
 * bleed, each with a 300 DPI PNG rasterised from the PDF itself. Lato comes
 * from Google Fonts, as in scripts/brand-kit.ts, so it needs the network;
 * the PNGs need pdftoppm (poppler).
 */
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import * as NUrl from "node:url"
import colors from "../brand/colors.json" with { type: "json" }

export interface Format {
  name: string
  width: number
  height: number
  /** Headline size in px. */
  size: number
  /** A print format: written as PDF and 300 DPI PNG, with this bleed in inches. */
  print?: {
    bleed: number
  }
}

/**
 * CSS pixels to the inch. Chromium prints at this scale, so a print format
 * is laid out in pixels and comes out of the PDF at its size in inches.
 */
export const CssPerInch = 96

/** Raster resolution of the print PNGs. */
export const PrintDpi = 300

export const Formats: Format[] = [
  {
    name: "1500x500",
    width: 1500,
    height: 500,
    size: 140,
  },
  {
    name: "1200x630",
    width: 1200,
    height: 630,
    size: 110,
  },
  // A 3 × 6 ft vinyl banner. Half an inch of bleed covers a trim that
  // wanders; the margin keeps logo and headline over 4 in from the edge,
  // clear of hems and grommets.
  {
    name: "72x36in",
    width: 72 * CssPerInch,
    height: 36 * CssPerInch,
    size: 0.18 * 36 * CssPerInch,
    print: {
      bleed: 0.5,
    },
  },
]

/**
 * The kit’s lockups a banner can carry top left, white, each with its ink
 * height as a share of the banner’s height. The house mark alone is drawn
 * larger than the house in the horizontal lockup, so it holds the corner
 * without the wordmark beside it.
 */
export const Lockups = {
  horizontal: {
    file: "homebase-horizontal-white.svg",
    share: 0.09,
  },
  mark: {
    file: "homebase-mark-white.svg",
    share: 0.12,
  },
}

export type Lockup = keyof typeof Lockups

export interface Banner {
  slug: string
  headline: string
  logo: Lockup
}

/** Copy per the kit’s voice: $home in lowercase, Based House and the city. */
export const Banners: Banner[] = [
  {
    slug: "welcome-home",
    headline: "Welcome $home",
    logo: "mark",
  },
  {
    slug: "based-house-mumbai",
    headline: "Based House Mumbai",
    logo: "horizontal",
  },
]

/** The kit’s display setting: Lato 700, −0.01 em tracking. */
export const Display = {
  weight: 700,
  tracking: -0.01,
}

/** The outer margin, as a share of the banner’s height. */
const MarginShare = 0.128

/** The kit’s clear space: a fifth of the logo’s height on every side. */
export const ClearSpace = 0.2

/**
 * Where X’s avatar covers a 1500 × 500 header, in header pixels: a circle
 * 335 px across, its left edge 40 px in, overlapping the bottom by half.
 */
export const XAvatar = {
  cx: 40 + 335 / 2,
  cy: 500,
  r: 335 / 2,
}

export interface Metrics {
  /** Cap height of the face at the headline size. */
  cap: number
  /** Where the ink starts, right of the pen: the first glyph’s side bearing. */
  left: number
  /** Where the ink ends, right of the pen. */
  right: number
  /** Ink depth below the baseline. */
  descent: number
}

/** The logo’s dots inside its viewBox, so its ink can sit on the margin. */
export interface LogoInk {
  viewWidth: number
  viewHeight: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Layout {
  margin: number
  logo: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Ink bounds of the logo on the banner. */
  logoInk: Box
  headline: {
    x: number
    baseline: number
  }
}

export function layout(
  format: Format,
  metrics: Metrics,
  lockup: Lockup,
  ink: LogoInk,
): Layout {
  const margin = format.height * MarginShare
  const scale = (format.height * Lockups[lockup].share) / (ink.bottom - ink.top)
  const logo = {
    x: margin - ink.left * scale,
    y: margin - ink.top * scale,
    width: ink.viewWidth * scale,
    height: ink.viewHeight * scale,
  }

  return {
    margin,
    logo,
    logoInk: {
      left: logo.x + ink.left * scale,
      right: logo.x + ink.right * scale,
      top: logo.y + ink.top * scale,
      bottom: logo.y + ink.bottom * scale,
    },
    // Centred on its ink, so neither the first letter’s side bearing nor the
    // tracking after the last one pulls it off the middle; the cap height
    // sits on the middle line.
    headline: {
      x: format.width / 2 - (metrics.left + metrics.right) / 2,
      baseline: format.height / 2 + metrics.cap / 2,
    },
  }
}

/** The headline’s ink on the banner, from cap height to its lowest stroke. */
export function headlineInk(placed: Layout, metrics: Metrics): Box {
  return {
    left: placed.headline.x + metrics.left,
    right: placed.headline.x + metrics.right,
    top: placed.headline.baseline - metrics.cap,
    bottom: placed.headline.baseline + metrics.descent,
  }
}

/** Whether the headline’s ink reaches into X’s avatar on the header. */
export function coversAvatar(placed: Layout, metrics: Metrics) {
  const box = headlineInk(placed, metrics)
  const nearestX = Math.max(box.left, Math.min(XAvatar.cx, box.right))
  const nearestY = Math.max(box.top, Math.min(XAvatar.cy, box.bottom))

  return Math.hypot(nearestX - XAvatar.cx, nearestY - XAvatar.cy) < XAvatar.r
}

/** Whether the headline keeps out of the logo’s clear space. */
export function clearOfLogo(placed: Layout, metrics: Metrics) {
  const box = headlineInk(placed, metrics)
  const logo = placed.logoInk
  const clear = (logo.bottom - logo.top) * ClearSpace

  return box.top >= logo.bottom + clear || box.left >= logo.right + clear
}

/** Whether the headline’s ink stays inside the outer margin. */
export function insideMargin(format: Format, placed: Layout, metrics: Metrics) {
  const box = headlineInk(placed, metrics)

  return box.left >= placed.margin
    && box.right <= format.width - placed.margin
}

export function logoInk(svg: string): LogoInk {
  const [, , viewWidth, viewHeight] = svg
    .match(/viewBox="([^"]+)"/)![1]
    .split(" ")
    .map(Number)
  const circles = [...svg.matchAll(/cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map(([, cx, cy, r]) => ({
      cx: Number(cx),
      cy: Number(cy),
      r: Number(r),
    }))

  return {
    viewWidth,
    viewHeight,
    left: Math.min(...circles.map((c) => c.cx - c.r)),
    right: Math.max(...circles.map((c) => c.cx + c.r)),
    top: Math.min(...circles.map((c) => c.cy - c.r)),
    bottom: Math.max(...circles.map((c) => c.cy + c.r)),
  }
}

/**
 * The banner as SVG. `bleed` (px) widens the blue on every side without
 * moving anything on it: the viewBox starts that far before the trim.
 */
export function bannerSvg(
  format: Format,
  placed: Layout,
  headline: string,
  logoSvg: string,
  bleed = 0,
): string {
  const width = format.width + 2 * bleed
  const height = format.height + 2 * bleed
  const logo = logoSvg
    .trim()
    .replace(/<svg [^>]*>/, (open) =>
      open
        .replace(/ width="[^"]*"/, "")
        .replace(/ height="[^"]*"/, "")
        .replace(
          "<svg ",
          `<svg x="${placed.logo.x}" y="${placed.logo.y}" width="${placed.logo.width}" height="${placed.logo.height}" `,
        ))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-bleed} ${-bleed} ${width} ${height}" style="display:block">`
    + `<rect x="${-bleed}" y="${-bleed}" width="${width}" height="${height}" fill="${colors.blue.hex}"/>`
    + logo
    + `<text x="${placed.headline.x}" y="${placed.headline.baseline}" fill="${colors.white.hex}" font-family="Lato" font-weight="${Display.weight}" font-size="${format.size}" letter-spacing="${
      Display.tracking * format.size
    }">${headline}</text>`
    + `</svg>`
}

if (import.meta.main) {
  const { chromium } = await import("playwright")
  const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))
  const OutDir = NPath.join(Here, "banners")
  const logos = Object.fromEntries(
    await Promise.all(
      Object.entries(Lockups).map(async ([lockup, { file }]) => {
        const svg = await Bun
          .file(NPath.join(Here, "../brand/logo/svg", file))
          .text()

        return [lockup, {
          svg,
          ink: logoInk(svg),
        }]
      }),
    ),
  ) as Record<Lockup, { svg: string; ink: LogoInk }>
  const head =
    `<link href="https://fonts.googleapis.com/css2?family=Lato:wght@${Display.weight}&display=swap" rel="stylesheet">`
    + `<style>@page{margin:0}html,body{margin:0}</style>`
  const PrintDir = NPath.join(OutDir, "print")

  await NFs.mkdir(PrintDir, {
    recursive: true,
  })
  const browser = await chromium.launch()

  /** A page with Lato loaded, checked by the loaded face itself. */
  async function open(density: number) {
    const page = await browser.newPage({
      deviceScaleFactor: density,
    })
    await page.setContent(head)

    // document.fonts.check is true when no Lato face exists at all, so
    // look for the loaded face itself rather than trust it.
    const loaded = await page.evaluate(async (weight) => {
      await document.fonts.load(`${weight} 16px Lato`)
      await document.fonts.ready

      let found = false
      document.fonts.forEach((face) => {
        found ||= face.family.replace(/"/g, "") === "Lato"
          && face.weight === String(weight)
          && face.status === "loaded"
      })

      return found
    }, Display.weight)
    if (!loaded) {
      throw new Error("Lato did not load from Google Fonts; check the network")
    }

    return page
  }

  const pages = {
    1: await open(1),
    2: await open(2),
  }

  /** Only the body changes, so the Lato already loaded stays loaded. */
  async function show(page: typeof pages[1], svg: string) {
    await page.evaluate((markup) => {
      document.body.innerHTML = markup
    }, svg)
  }

  for (const format of Formats) {
    for (const banner of Banners) {
      const metrics: Metrics = await pages[1].evaluate(
        ({ headline, size, weight, tracking }) => {
          const context = document.createElement("canvas").getContext("2d")!
          context.font = `${weight} ${size}px Lato`
          context.letterSpacing = `${tracking * size}px`
          const measured = context.measureText(headline)

          return {
            cap: context.measureText("H").actualBoundingBoxAscent,
            left: -measured.actualBoundingBoxLeft,
            right: measured.actualBoundingBoxRight,
            descent: measured.actualBoundingBoxDescent,
          }
        },
        {
          headline: banner.headline,
          size: format.size,
          weight: Display.weight,
          tracking: Display.tracking,
        },
      )
      const logo = logos[banner.logo]
      const placed = layout(format, metrics, banner.logo, logo.ink)
      const name = `${banner.slug}-${format.name}`

      if (!insideMargin(format, placed, metrics)) {
        throw new Error(`The ${name} headline runs past the margin`)
      }
      if (!clearOfLogo(placed, metrics)) {
        throw new Error(`The ${name} headline crowds the logo`)
      }
      if (format.name === "1500x500" && coversAvatar(placed, metrics)) {
        throw new Error(`The ${name} headline runs under X’s avatar`)
      }

      if (format.print) {
        for (const bleed of [0, format.print.bleed]) {
          const pad = bleed * CssPerInch
          const file = NPath.join(PrintDir, `${name}${bleed ? "-bleed" : ""}`)
          await show(
            pages[1],
            bannerSvg(format, placed, banner.headline, logo.svg, pad),
          )
          await pages[1].pdf({
            path: `${file}.pdf`,
            width: `${(format.width + 2 * pad) / CssPerInch}in`,
            height: `${(format.height + 2 * pad) / CssPerInch}in`,
            printBackground: true,
            pageRanges: "1",
          })

          // Rasterised from the PDF, so the PNG cannot drift from it.
          const raster = Bun.spawnSync([
            "pdftoppm",
            "-r",
            String(PrintDpi),
            "-png",
            "-singlefile",
            `${file}.pdf`,
            `${file}-${PrintDpi}dpi`,
          ], {
            stderr: "pipe",
          })
          if (raster.exitCode !== 0) {
            throw new Error(`pdftoppm: ${raster.stderr.toString()}`)
          }
        }
        continue
      }

      for (const density of [1, 2] as const) {
        await pages[density].setViewportSize({
          width: format.width,
          height: format.height,
        })
        await show(
          pages[density],
          bannerSvg(format, placed, banner.headline, logo.svg),
        )
        const suffix = density === 1 ? "" : `@${density}x`
        await pages[density].screenshot({
          path: NPath.join(OutDir, `${name}${suffix}.png`),
        })
      }
    }
  }

  await browser.close()
  console.log(`Banners written to ${OutDir}`)
}
