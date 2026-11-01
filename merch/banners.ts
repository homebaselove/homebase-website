/// <reference lib="dom" />
/**
 * Homebase banners, in the brand kit’s two social sizes: the X header
 * (1500 × 500) and the link preview (1200 × 630). Each is the kit’s
 * horizontal logo, white, top left, over a headline in Lato Bold, on
 * Homebase Blue, the way the kit’s own social images are set.
 *
 *   bun merch/banners.ts
 *
 * Writes merch/banners at 1× and 2×. Lato comes from Google Fonts, as in
 * scripts/brand-kit.ts, so it needs the network.
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
  /**
   * Where the headline sits: in the middle, or on the bottom margin. The X
   * header keeps it in the middle because X lays the avatar over the
   * bottom left of the header.
   */
  anchor: "middle" | "bottom"
}

export const Formats: Format[] = [
  {
    name: "1500x500",
    width: 1500,
    height: 500,
    size: 140,
    anchor: "middle",
  },
  {
    name: "1200x630",
    width: 1200,
    height: 630,
    size: 165,
    anchor: "bottom",
  },
]

export interface Banner {
  slug: string
  /** The headline, line by line, for each format. */
  lines: Record<string, string[]>
}

/** Copy per the kit’s voice: $home in lowercase, Based House and the city. */
export const Banners: Banner[] = [
  {
    slug: "welcome-home",
    lines: {
      "1500x500": ["Welcome $home"],
      "1200x630": ["Welcome", "$home"],
    },
  },
  {
    slug: "based-house-mumbai",
    lines: {
      "1500x500": ["Based House Mumbai"],
      "1200x630": ["Based House", "Mumbai"],
    },
  },
]

/** The kit’s display setting: Lato 700, 1.08 line height, −0.01 em tracking. */
export const Display = {
  weight: 700,
  lineHeight: 1.08,
  tracking: -0.01,
}

/** Logo height and outer margin, as shares of the banner’s height. */
const LogoShare = 0.09

const MarginShare = 0.128

/**
 * Where X’s avatar covers a 1500 × 500 header, in header pixels: a circle
 * 335 px across, its left edge 40 px in, overlapping the bottom by half.
 */
export const XAvatar = {
  cx: 40 + 335 / 2,
  cy: 500,
  r: 335 / 2,
}

export interface LineMetrics {
  width: number
  /** Ink start, right of the pen: the left side bearing of the first glyph. */
  left: number
  /** Ink depth below the baseline. */
  descent: number
}

export interface Metrics {
  /** Cap height of the face at the headline size. */
  cap: number
  lines: LineMetrics[]
}

/** The logo’s dots inside its viewBox, so its ink can sit on the margin. */
export interface LogoInk {
  viewWidth: number
  viewHeight: number
  left: number
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
  lines: {
    x: number
    baseline: number
    text: string
  }[]
}

export function layout(
  format: Format,
  text: readonly string[],
  metrics: Metrics,
  ink: LogoInk,
): Layout {
  const margin = format.height * MarginShare
  const scale = (format.height * LogoShare) / (ink.bottom - ink.top)
  const leading = format.size * Display.lineHeight
  const block = metrics.cap + (text.length - 1) * leading
  const firstBaseline = format.anchor === "middle"
    ? format.height / 2 - block / 2 + metrics.cap
    : format.height - margin - (text.length - 1) * leading

  return {
    margin,
    logo: {
      x: margin - ink.left * scale,
      y: margin - ink.top * scale,
      width: ink.viewWidth * scale,
      height: ink.viewHeight * scale,
    },
    lines: text.map((line, index) => ({
      x: margin - metrics.lines[index].left,
      baseline: firstBaseline + index * leading,
      text: line,
    })),
  }
}

/** Whether any line’s ink box reaches into X’s avatar on the header. */
export function coversAvatar(placed: Layout, metrics: Metrics) {
  return placed.lines.some((line, index) => {
    const { width, left, descent } = metrics.lines[index]
    const box = {
      left: line.x + left,
      right: line.x + width,
      top: line.baseline - metrics.cap,
      bottom: line.baseline + descent,
    }
    const nearestX = Math.max(box.left, Math.min(XAvatar.cx, box.right))
    const nearestY = Math.max(box.top, Math.min(XAvatar.cy, box.bottom))

    return Math.hypot(nearestX - XAvatar.cx, nearestY - XAvatar.cy) < XAvatar.r
  })
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
    top: Math.min(...circles.map((c) => c.cy - c.r)),
    bottom: Math.max(...circles.map((c) => c.cy + c.r)),
  }
}

export function bannerSvg(
  format: Format,
  placed: Layout,
  logoSvg: string,
): string {
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format.width}" height="${format.height}" viewBox="0 0 ${format.width} ${format.height}" style="display:block">`
    + `<rect width="${format.width}" height="${format.height}" fill="${colors.blue.hex}"/>`
    + logo
    + placed
      .lines
      .map((line) =>
        `<text x="${line.x}" y="${line.baseline}" fill="${colors.white.hex}" font-family="Lato" font-weight="${Display.weight}" font-size="${format.size}" letter-spacing="${
          Display.tracking * format.size
        }">${line.text}</text>`
      )
      .join("")
    + `</svg>`
}

if (import.meta.main) {
  const { chromium } = await import("playwright")
  const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))
  const OutDir = NPath.join(Here, "banners")
  const logoSvg = await Bun
    .file(NPath.join(Here, "../brand/logo/svg/homebase-horizontal-white.svg"))
    .text()
  const ink = logoInk(logoSvg)
  const head =
    `<link href="https://fonts.googleapis.com/css2?family=Lato:wght@${Display.weight}&display=swap" rel="stylesheet">`
    + `<style>html,body{margin:0}</style>`

  await NFs.mkdir(OutDir, {
    recursive: true,
  })
  const browser = await chromium.launch()

  for (const density of [1, 2]) {
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

    for (const format of Formats) {
      for (const banner of Banners) {
        const text = banner.lines[format.name]
        const metrics: Metrics = await page.evaluate(
          ({ text, size, weight, tracking }) => {
            const context = document.createElement("canvas").getContext("2d")!
            context.font = `${weight} ${size}px Lato`
            context.letterSpacing = `${tracking * size}px`

            return {
              cap: context.measureText("H").actualBoundingBoxAscent,
              lines: text.map((line) => {
                const measured = context.measureText(line)

                return {
                  width: measured.width,
                  left: -measured.actualBoundingBoxLeft,
                  descent: measured.actualBoundingBoxDescent,
                }
              }),
            }
          },
          {
            text,
            size: format.size,
            weight: Display.weight,
            tracking: Display.tracking,
          },
        )
        const placed = layout(format, text, metrics, ink)

        for (const [index, line] of metrics.lines.entries()) {
          const right = placed.lines[index].x + line.width
          if (right > format.width - placed.margin) {
            throw new Error(
              `"${
                text[index]
              }" runs past the margin of the ${format.name} banner`,
            )
          }
        }

        if (format.name === "1500x500" && coversAvatar(placed, metrics)) {
          throw new Error(
            `The ${banner.slug} headline runs under X’s avatar in the header`,
          )
        }

        // Only the body changes, so the Lato already loaded stays loaded.
        await page.setViewportSize({
          width: format.width,
          height: format.height,
        })
        await page.evaluate((svg) => {
          document.body.innerHTML = svg
        }, bannerSvg(format, placed, logoSvg))
        const suffix = density === 1 ? "" : `@${density}x`
        await page.screenshot({
          path: NPath.join(
            OutDir,
            `${banner.slug}-${format.name}${suffix}.png`,
          ),
        })
      }
    }

    await page.close()
  }

  await browser.close()
  console.log(`Banners written to ${OutDir}`)
}
