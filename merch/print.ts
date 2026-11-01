/// <reference lib="dom" />
import type { Page } from "playwright"

/**
 * CSS pixels to the inch. Chromium prints at this scale, so print art is
 * laid out in pixels and comes out of the PDF at its size in inches.
 */
export const CssPerInch = 96

/** Raster resolution of the print PNGs. */
export const PrintDpi = 300

/** A logo file’s dots inside its viewBox, so its ink can be placed exactly. */
export interface LogoInk {
  viewWidth: number
  viewHeight: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
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

/** A kit logo file, sized and placed to sit inside another SVG. */
export function nest(logoSvg: string, box: Box) {
  return logoSvg
    .trim()
    .replace(/<svg [^>]*>/, (open) =>
      open
        .replace(/ width="[^"]*"/, "")
        .replace(/ height="[^"]*"/, "")
        .replace(
          "<svg ",
          `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" `,
        ))
}

/**
 * Writes `svg` as a one-page PDF of `size` (CSS lengths, such as "72in" or
 * "297mm") and as a PNG at PrintDpi rasterised from that PDF by pdftoppm,
 * so the two cannot differ. The page’s styles stay; only the body changes.
 */
export async function writePrint(
  page: Page,
  svg: string,
  file: string,
  size: {
    width: string
    height: string
  },
) {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup
  }, svg)
  await page.pdf({
    path: `${file}.pdf`,
    width: size.width,
    height: size.height,
    printBackground: true,
    pageRanges: "1",
  })

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
