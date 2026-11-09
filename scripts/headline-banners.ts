/**
 * Homebase headline banners: a logo from the brand kit, white, top left, and
 * a headline in Lato Bold centred on Homebase Blue. Each comes in the kit’s
 * two social sizes, the X header (1500 × 500) and the link preview
 * (1200 × 630), and printed at 3 × 6 ft.
 *
 *   bun scripts/headline-banners.ts
 *
 * Writes the social sizes to `social/` at 1× and 2×, and the print size to
 * `print/` as vector PDF at actual size, and with bleed and a TrimBox. Lato
 * comes from Google Fonts, as in scripts/brand-kit.ts, so it needs the
 * network. Set CHROMIUM_PATH when the local Playwright has no browser of its
 * own.
 */
import * as NPath from "node:path"
import colors from "../brand/colors.json" with { type: "json" }
import {
  CssPerInch,
  Display,
  latoPage,
  launch,
  type LogoInk,
  logoInk,
  measure,
  nest,
  show,
  writePdf,
} from "./render.ts"

export interface Format {
  /** File names end with this. */
  name: string
  width: number
  height: number
  /** Headline size in px. */
  size: number
  /** A print format: written as PDF, with this bleed in inches. */
  print?: {
    bleed: number
  }
}

export const XHeader: Format = {
  name: "x-header-1500x500",
  width: 1500,
  height: 500,
  size: 140,
}

export const LinkPreview: Format = {
  name: "og-1200x630",
  width: 1200,
  height: 630,
  size: 110,
}

/**
 * A 3 × 6 ft vinyl banner. Half an inch of bleed covers a trim that wanders;
 * the margin keeps logo and headline over 4 in from the edge, clear of hems
 * and grommets.
 */
export const PrintBanner: Format = {
  name: "banner-3x6ft",
  width: 72 * CssPerInch,
  height: 36 * CssPerInch,
  size: 0.18 * 36 * CssPerInch,
  print: {
    bleed: 0.5,
  },
}

export const Formats = [XHeader, LinkPreview, PrintBanner]

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
  const logo = nest(logoSvg, placed.logo)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-bleed} ${-bleed} ${width} ${height}" style="display:block">`
    + `<rect x="${-bleed}" y="${-bleed}" width="${width}" height="${height}" fill="${colors.blue.hex}"/>`
    + logo
    + `<text x="${placed.headline.x}" y="${placed.headline.baseline}" fill="${colors.white.hex}" font-family="Lato" font-weight="${Display.weight}" font-size="${format.size}" letter-spacing="${
      Display.tracking * format.size
    }">${headline}</text>`
    + `</svg>`
}

if (import.meta.main) {
  const SocialDir = NPath.join(import.meta.dir, "..", "social")
  const PrintDir = NPath.join(import.meta.dir, "..", "print")
  const logos = Object.fromEntries(
    await Promise.all(
      Object.entries(Lockups).map(async ([lockup, { file }]) => {
        const svg = await Bun
          .file(NPath.join(import.meta.dir, "..", "brand", "logo", "svg", file))
          .text()

        return [lockup, {
          svg,
          ink: logoInk(svg),
        }]
      }),
    ),
  ) as Record<Lockup, { svg: string; ink: LogoInk }>

  const browser = await launch()
  const pages = {
    1: await latoPage(browser, colors.blue.hex, 1),
    2: await latoPage(browser, colors.blue.hex, 2),
  }

  for (const format of Formats) {
    for (const banner of Banners) {
      const measured = await measure(pages[1], [banner.headline], format.size)
      const metrics: Metrics = {
        cap: measured.cap,
        left: measured.lines[0].left,
        right: measured.lines[0].right,
        descent: measured.lines[0].descent,
      }
      const logo = logos[banner.logo]
      const placed = layout(format, metrics, banner.logo, logo.ink)
      const name = `${banner.slug}-${format.name}`

      if (!insideMargin(format, placed, metrics)) {
        throw new Error(`The ${name} headline runs past the margin`)
      }
      if (!clearOfLogo(placed, metrics)) {
        throw new Error(`The ${name} headline crowds the logo`)
      }
      if (format === XHeader && coversAvatar(placed, metrics)) {
        throw new Error(`The ${name} headline runs under X’s avatar`)
      }

      if (format.print) {
        const feet = (px: number) => px / CssPerInch / 12
        const title = `${banner.headline} banner, ${feet(format.height)} × ${
          feet(format.width)
        } ft`
        const size = {
          width: format.width / CssPerInch,
          height: format.height / CssPerInch,
          unit: "in",
        } as const
        const { bleed } = format.print

        await writePdf(pages[1], NPath.join(PrintDir, `${name}.pdf`), {
          svg: bannerSvg(format, placed, banner.headline, logo.svg),
          title,
          size,
        })
        await writePdf(pages[1], NPath.join(PrintDir, `${name}-bleed.pdf`), {
          svg: bannerSvg(
            format,
            placed,
            banner.headline,
            logo.svg,
            bleed * CssPerInch,
          ),
          title: `${title}, ${bleed} in bleed`,
          size,
          bleed,
        })
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
          path: NPath.join(SocialDir, `${name}${suffix}.png`),
        })
      }
    }
  }

  await browser.close()
  console.log(`Banners written to ${SocialDir} and ${PrintDir}`)
}
