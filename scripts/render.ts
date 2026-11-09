/**
 * What the brand kit, banner, poster and avatar scripts share: the kit’s
 * logo files placed by their ink, Lato from Google Fonts as the kit sets it,
 * and print PDFs at size, with bleed and a TrimBox.
 */
import type { Browser, Page } from "playwright"

/**
 * The page’s document, as the code `page.evaluate` runs in Chromium sees it.
 * The repo’s TypeScript has no DOM library, and a reference to one here would
 * reach every file in it, so only what these scripts use is declared, and for
 * this module alone.
 */
declare const document: {
  title: string
  body: {
    innerHTML: string
  }
  fonts: {
    load(font: string): Promise<unknown>
    forEach(
      each: (face: {
        family: string
        weight: string
        status: string
      }) => void,
    ): void
  }
  createElement(tag: "canvas"): {
    getContext(kind: "2d"): {
      font: string
      letterSpacing: string
      measureText(text: string): {
        actualBoundingBoxLeft: number
        actualBoundingBoxRight: number
        actualBoundingBoxAscent: number
        actualBoundingBoxDescent: number
      }
    } | null
  }
}

/**
 * Chromium, from CHROMIUM_PATH when the local Playwright has no browser of
 * its own.
 */
export async function launch() {
  const { chromium } = await import("playwright")

  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  })
}

/**
 * CSS pixels to the inch. Chromium prints at this scale, so print art is
 * laid out in pixels and comes out of the PDF at its size in inches.
 */
export const CssPerInch = 96

/** The kit’s display setting: Lato 700, 1.08 line height, −0.01 em tracking. */
export const Display = {
  weight: 700,
  lineHeight: 1.08,
  tracking: -0.01,
}

/**
 * Stamped into every PDF in place of the moment it was printed, so a
 * rebuild of an unchanged design writes the same bytes.
 */
const PdfDate = "20261101000000"

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
 * The Lato weights that have not loaded on `page`, asked for by name.
 * `document.fonts.check` is true when no Lato face exists at all, so a weight
 * counts only once a Lato face of that weight has loaded.
 */
export async function missingLato(page: Page, weights: readonly number[]) {
  return page.evaluate(async (weights) => {
    await Promise.all(
      weights.map((weight) => document.fonts.load(`${weight} 16px Lato`)),
    )
    const loaded = new Set<string>()
    document.fonts.forEach((face) => {
      if (
        face.family.replace(/"/g, "") === "Lato" && face.status === "loaded"
      ) {
        loaded.add(face.weight)
      }
    })

    return weights.filter((weight) => !loaded.has(String(weight)))
  }, weights)
}

/**
 * A page with Lato loaded from Google Fonts and `background` behind
 * everything, so a hairline at a print trim comes out that colour.
 */
export async function latoPage(
  browser: Browser,
  background: string,
  density = 1,
) {
  const page = await browser.newPage({
    deviceScaleFactor: density,
  })
  await page.setContent(
    `<link href="https://fonts.googleapis.com/css2?family=Lato:wght@${Display.weight}&display=swap" rel="stylesheet">`
      + `<style>@page{margin:0}html,body{margin:0;background:${background}}</style>`,
  )
  if ((await missingLato(page, [Display.weight])).length > 0) {
    throw new Error("Lato did not load from Google Fonts; check the network")
  }

  return page
}

export interface TextInk {
  /** Where the ink starts, right of the pen: the first glyph’s side bearing. */
  left: number
  /** Where the ink ends, right of the pen. */
  right: number
  /** Ink height above the baseline. */
  ascent: number
  /** Ink depth below the baseline. */
  descent: number
}

/** The ink of each line, and the cap height, in Lato at the kit’s setting. */
export async function measure(page: Page, lines: string[], size: number) {
  return page.evaluate(
    ({ lines, size, weight, tracking }) => {
      const context = document.createElement("canvas").getContext("2d")!
      context.font = `${weight} ${size}px Lato`
      context.letterSpacing = `${tracking * size}px`

      return {
        cap: context.measureText("H").actualBoundingBoxAscent,
        lines: lines.map((line) => {
          const measured = context.measureText(line)

          return {
            left: -measured.actualBoundingBoxLeft,
            right: measured.actualBoundingBoxRight,
            ascent: measured.actualBoundingBoxAscent,
            descent: measured.actualBoundingBoxDescent,
          }
        }),
      }
    },
    {
      lines,
      size,
      weight: Display.weight,
      tracking: Display.tracking,
    },
  )
}

/** Shows `svg` as the page’s body, keeping the page’s styles and fonts. */
export async function show(page: Page, svg: string) {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup
  }, svg)
}

/** A page’s size, at the trim, and the unit it is measured in. */
export interface PageSize {
  width: number
  height: number
  unit: "in" | "mm" | "px"
}

const PerInch = {
  in: 1,
  mm: 25.4,
  px: CssPerInch,
}

/**
 * Writes `svg` as a one-page vector PDF of `size` with `bleed` (in the
 * size’s unit) past every edge, titled, stamped with a fixed date, and with
 * a TrimBox at `size` when there is bleed.
 */
export async function writePdf(
  page: Page,
  file: string,
  { svg, title, size, bleed = 0 }: {
    svg: string
    title: string
    size: PageSize
    bleed?: number
  },
) {
  await show(page, svg)
  await page.evaluate((title) => {
    document.title = title
  }, title)
  const pdf = await page.pdf({
    width: `${size.width + 2 * bleed}${size.unit}`,
    height: `${size.height + 2 * bleed}${size.unit}`,
    printBackground: true,
    pageRanges: "1",
  })

  // Read byte for byte (latin1 maps each byte to one character and back),
  // and the date is as long as the one it replaces, so the binary streams
  // and every offset in the cross-reference table still hold.
  const dated = Buffer.from(
    pdf
      .toString("latin1")
      .replace(
        /\/(CreationDate|ModDate) \(D:\d{14}/g,
        (_, key) => `/${key} (D:${PdfDate}`,
      ),
    "latin1",
  )
  const inches = (value: number) => value / PerInch[size.unit]

  await Bun.write(
    file,
    bleed > 0
      ? trimBoxed(
        dated,
        inches(bleed),
        inches(size.width),
        inches(size.height),
      )
      : dated,
  )
}

/**
 * Chromium sets no TrimBox, so a RIP would take the bleed for part of the
 * print. This adds TrimBox and BleedBox to the page as an incremental update,
 * the PDF's own way to amend a file: a new copy of the page object, an xref
 * section pointing to it, and a trailer chained to the original's. Sizes are
 * in inches.
 *
 * Chromium lays the art out from the page's top left corner and rounds the
 * page up to its print grid, which leaves an A size up to 0.4 mm over at the
 * bottom and right. So both boxes are measured down from the MediaBox's top,
 * where the art starts.
 */
export function trimBoxed(
  pdf: Uint8Array,
  bleed: number,
  width: number,
  height: number,
) {
  const text = Buffer.from(pdf).toString("latin1")
  const object = /(\d+) 0 obj\s*<<\/Type \/Page\b/.exec(text)
  const trailer = /trailer\s*<<([^>]*)>>\s*startxref\s*(\d+)\s*%%EOF\s*$/.exec(
    text,
  )
  if (!object || !trailer || /\/(TrimBox|Prev)\b/.test(text)) {
    throw new Error("Chromium's PDF is not laid out as expected")
  }
  const start = text.indexOf("<<", object.index)
  let end = start
  for (let depth = 0; end < text.length; end++) {
    if (text[end] === "(") {
      throw new Error("the page dictionary holds a string")
    }
    if (text.startsWith("<<", end)) {
      depth++
      end++
    } else if (text.startsWith(">>", end)) {
      if (--depth === 0) {
        break
      }
      end++
    }
  }
  if (end >= text.length) {
    throw new Error("the page dictionary never closes")
  }
  const media = /\/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/.exec(
    text.slice(start, end),
  )
  if (!media) {
    throw new Error("the page has no MediaBox from the origin")
  }
  const top = Number(media[1])
  const points = (inches: number) => +(inches * 72).toFixed(2)
  const below = (inches: number) => +(top - inches * 72).toFixed(2)
  const trim = [
    points(bleed),
    below(bleed + height),
    points(bleed + width),
    below(bleed),
  ]
  const bled = [0, below(2 * bleed + height), points(2 * bleed + width), top]
  const copy = `${object[1]} 0 obj\n${text.slice(start, end)}\n/TrimBox [${
    trim.join(" ")
  }]\n/BleedBox [${bled.join(" ")}]>>\nendobj\n`
  const objectAt = pdf.length
  const xrefAt = objectAt + copy.length
  const update = [
    copy,
    `xref\n${object[1]} 1\n${String(objectAt).padStart(10, "0")} 00000 n \n`,
    `trailer\n<<${trailer[1]}\n/Prev ${trailer[2]}>>\n`,
    `startxref\n${xrefAt}\n%%EOF\n`,
  ]
    .join("")
  return Buffer.concat([pdf, Buffer.from(update, "latin1")])
}

/**
 * Rasterises a PDF to PNG with pdftoppm, with its long side at a pixel size,
 * so a raster cannot drift from its vector.
 */
export function rasterize(pdf: string, png: string, pixels: number) {
  const raster = Bun.spawnSync([
    "pdftoppm",
    "-scale-to",
    String(pixels),
    "-png",
    "-singlefile",
    pdf,
    png.replace(/\.png$/, ""),
  ], {
    stderr: "pipe",
  })
  if (raster.exitCode !== 0) {
    throw new Error(`pdftoppm: ${raster.stderr.toString()}`)
  }
}
