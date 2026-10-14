/// <reference lib="dom" />
/**
 * Builds the shirt print files and the mockups.
 *
 *   bun merch/build.ts
 *
 * Print files land in merch/print at 300 DPI, with a placement guide for the
 * Based House back; mockups land in merch/mockups, and the Telegram avatar
 * in merch/telegram.
 * Needs the Chromium Playwright drives (`bunx playwright install chromium`).
 */
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import * as NUrl from "node:url"
import { chromium, type Page } from "playwright"
import { avatarSvg } from "./avatar.ts"
import {
  basedHouse,
  bounds,
  type Design,
  EggWidth,
  seedMe,
  type Vector,
} from "./designs.ts"
import { liftEgg } from "./egg.ts"
import { Space } from "./geometry.ts"
import { light } from "./light.ts"
import { BackCollar, Canvas, shirtLayers, type Side } from "./shirt.ts"

const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))

const PrintDir = NPath.join(Here, "print")

const MockupDir = NPath.join(Here, "mockups")

const TelegramDir = NPath.join(Here, "telegram")

/**
 * Telegram avatar sizes: the largest worth rendering, and a size to upload
 * that Telegram only has to scale down.
 */
const AvatarSizes = [8192, 1280]

const Dpi = 300

/** Mockup pixels per garment inch. */
const MockupScale = 120

/** Placement guide pixels per garment inch. */
const GuideScale = 60

const Sides: Side[] = ["front", "back"]

async function loadWordmark(): Promise<Vector> {
  const svg = await Bun
    .file(NPath.join(Here, "source/seedme-wordmark.svg"))
    .text()
  const [, , width, height] = svg
    .match(/viewBox="([^"]+)"/)![1]
    .split(" ")
    .map(Number)

  return {
    path: svg.match(/ d="([^"]+)"/)![1],
    width,
    height,
  }
}

async function render(
  page: Page,
  markup: string,
  width: number,
  height: number,
  file: string,
) {
  await page.setViewportSize({
    width,
    height,
  })
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`,
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: file,
    omitBackground: true,
    type: file.endsWith(".png") ? "png" : "jpeg",
    quality: file.endsWith(".png") ? undefined : 92,
  })
}

/** Marks a PNG as 300 DPI so print software reads its physical size. */
async function stampDpi(file: string) {
  const png = new Uint8Array(await Bun.file(file).arrayBuffer())
  const perMeter = Math.round(Dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set(new TextEncoder().encode("pHYs"), 4)
  view.setUint32(8, perMeter)
  view.setUint32(12, perMeter)
  chunk[16] = 1
  view.setUint32(17, Bun.hash.crc32(chunk.subarray(4, 17)))
  // Right after the signature (8 bytes) and IHDR (25 bytes).
  await Bun.write(
    file,
    new Uint8Array([...png.subarray(0, 33), ...chunk, ...png.subarray(33)]),
  )
}

async function printFiles(page: Page, design: Design) {
  for (const side of Sides) {
    const artworks = design.prints[side]
    const box = bounds(artworks)
    const width = Math.round(box.width * Dpi)
    const height = Math.round(box.height * Dpi)
    const space = new Space(Dpi, -box.x * Dpi, -box.y * Dpi)
    const art = artworks
      .map((artwork) => artwork.draw(space))
      .join("")
    const name = `${design.slug}-${side}`
    const vector = !art.includes("<image")

    if (vector) {
      await Bun.write(
        NPath.join(PrintDir, `${name}.svg`),
        `<svg xmlns="http://www.w3.org/2000/svg" width="${
          box.width.toFixed(3)
        }in" height="${
          box.height.toFixed(3)
        }in" viewBox="0 0 ${width} ${height}">${art}</svg>\n`,
      )
    }

    const png = NPath.join(PrintDir, `${name}.png`)
    await render(
      page,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">${art}</svg>`,
      width,
      height,
      png,
    )
    await stampDpi(png)

    console.log(
      `${name}: ${box.width.toFixed(2)} × ${box.height.toFixed(2)} in, `
        + `${box.x.toFixed(2)} in from centre, ${
          box.y.toFixed(2)
        } in below the shoulder`,
    )
  }
}

/** One side of the shirt, lit, as a base64 JPEG. */
async function shirt(page: Page, design: Design, side: Side, scale: number) {
  const layers = shirtLayers({
    side,
    fabric: design.fabric,
    print: (s) =>
      design
        .prints[side]
        .map((artwork) => artwork.draw(s))
        .join(""),
  }, scale)

  return page.evaluate(light, {
    backdrop: layers.backdrop,
    albedo: layers.albedo,
    masks: layers.masks,
    folds: layers.folds,
    details: layers.details,
    occlusion: layers.occlusion,
    width: layers.width,
    height_: layers.height,
    scale,
    relief: design.fabric.relief,
    sheen: design.fabric.sheen,
  })
}

async function mockups(page: Page, design: Design) {
  const views: string[] = []

  for (const side of Sides) {
    const jpeg = await shirt(page, design, side, MockupScale)
    await Bun.write(
      NPath.join(MockupDir, `${design.slug}-${side}.jpg`),
      Buffer.from(jpeg, "base64"),
    )
    views.push(jpeg)
  }

  // Front and back side by side, for sharing.
  const width = 3600
  const height = Math.round((width / 2) * (Canvas.height / Canvas.width))
  await render(
    page,
    `<div style="display:flex;width:${width}px;background:#e8e8eb;font:600 ${
      width / 120
    }px Inter,sans-serif;letter-spacing:.24em;color:#8a8a93;text-align:center">${
      views
        .map((jpeg, index) =>
          `<div style="position:relative;width:50%"><img src="data:image/jpeg;base64,${jpeg}" style="display:block;width:100%"><div style="position:absolute;left:0;right:0;bottom:${
            width / 60
          }px">${Sides[index].toUpperCase()}</div></div>`
        )
        .join("")
    }</div>`,
    width,
    height,
    NPath.join(MockupDir, `${design.slug}.jpg`),
  )
}

/**
 * The back print on the shirt with its measurements, to send the printer
 * along with the file. Measured the way printers measure a back print:
 * down from the back neck seam at centre back.
 */
async function placementGuide(page: Page, design: Design) {
  const box = bounds(design.prints.back)
  const jpeg = await shirt(page, design, "back", GuideScale)
  const width = Canvas.width * GuideScale
  const height = Canvas.height * GuideScale
  const s = new Space(GuideScale, width / 2, Canvas.top * GuideScale)
  const size = (inches: number) =>
    `${+inches.toFixed(2)} in · ${(inches * 2.54).toFixed(1)} cm`
  const font = 22
  /** A pill centred on x, or starting at x when `from` is "left". */
  const label = (x: number, y: number, text: string, from = "centre") => {
    const w = text.length * font * 0.56 + 28
    const cx = from === "left" ? x + w / 2 : x

    return `<rect x="${cx - w / 2}" y="${y - font}" width="${w}" height="${
      font * 2
    }" rx="${font}" fill="#fff"/><text x="${cx}" y="${
      y + font * 0.36
    }" text-anchor="middle">${text}</text>`
  }
  const dimension = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#tip)" marker-end="url(#tip)"/>`

  const top = s.y(box.y)
  const bottom = s.y(box.y + box.height)
  const left = s.x(box.x)
  const right = s.x(box.x + box.width)
  const collar = s.y(BackCollar)
  const pad = s.len(0.12)
  const widthAt = bottom + s.len(0.6)
  const heightAt = right + s.len(0.45)

  const overlay =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="position:absolute;inset:0" font-family="Inter,sans-serif" font-weight="600" font-size="${font}" fill="#10131c">
    <defs>
      <marker id="tip" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10Z" fill="#fff"/>
      </marker>
    </defs>
    <g stroke="#fff" stroke-width="3" fill="none">
      <line x1="${s.x(0)}" y1="${collar - s.len(0.4)}" x2="${s.x(0)}" y2="${
      widthAt + s.len(1)
    }" stroke-dasharray="10 8" stroke-opacity="0.7"/>
      <line x1="${s.x(-1.6)}" y1="${collar}" x2="${s.x(1.6)}" y2="${collar}"/>
      <rect x="${left - pad}" y="${top - pad}" width="${
      right - left + pad * 2
    }" height="${bottom - top + pad * 2}" stroke-dasharray="10 8"/>
      ${dimension(s.x(0), collar + 4, s.x(0), top - pad - 4)}
      ${dimension(left, widthAt, right, widthAt)}
      <line x1="${left}" y1="${bottom + pad + 6}" x2="${left}" y2="${
      widthAt + s.len(0.2)
    }"/>
      <line x1="${right}" y1="${bottom + pad + 6}" x2="${right}" y2="${
      widthAt + s.len(0.2)
    }"/>
      ${dimension(heightAt, top, heightAt, bottom)}
    </g>
    ${label(s.x(-3.4), collar, "back neck seam")}
    ${label(s.x(0), (collar + top) / 2, size(box.y - BackCollar))}
    ${label(s.x(0), widthAt, size(box.width))}
    ${
      label(
        heightAt + s.len(0.2),
        (top + bottom) / 2,
        size(box.height),
        "left",
      )
    }
    ${label(s.x(0), widthAt + s.len(1.35), "centre back")}
    <g font-size="${font * 1.35}" text-anchor="middle">
      <text x="${width / 2}" y="${
      height - s.len(1.9)
    }">${design.title.toUpperCase()} · BACK PRINT</text>
      <text x="${width / 2}" y="${
      height - s.len(1.25)
    }" font-weight="500" font-size="${font}" fill="#3d4150">${design.slug}-back.png · ${
      box.width.toFixed(2)
    } × ${
      box.height.toFixed(2)
    } in at 300 DPI · white ink · centred on centre back</text>
      <text x="${width / 2}" y="${
      height - s.len(0.8)
    }" font-weight="500" font-size="${font}" fill="#3d4150">Top edge ${
      size(box.y - BackCollar)
    } below the back neck seam, the same on every size</text>
    </g>
  </svg>`

  await render(
    page,
    `<div style="position:relative;width:${width}px;height:${height}px"><img src="data:image/jpeg;base64,${jpeg}" style="display:block;width:100%">${overlay}</div>`,
    width,
    height,
    NPath.join(PrintDir, `${design.slug}-back-placement.jpg`),
  )
}

/** The Based House Mumbai avatar for Telegram, as a vector and as PNGs. */
async function telegramAvatar(page: Page) {
  await Bun.write(
    NPath.join(TelegramDir, "based-house-mumbai.svg"),
    avatarSvg(1024),
  )

  for (const size of AvatarSizes) {
    await render(
      page,
      avatarSvg(size).replace("<svg ", `<svg style="display:block" `),
      size,
      size,
      NPath.join(TelegramDir, `based-house-mumbai-${size}.png`),
    )
  }
}

await NFs.mkdir(PrintDir, { recursive: true })
await NFs.mkdir(MockupDir, { recursive: true })
await NFs.mkdir(TelegramDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()

await telegramAvatar(page)

const eggSource = await Bun
  .file(NPath.join(Here, "source/seedme-egg.jpg"))
  .arrayBuffer()
await page.setContent("<!doctype html><html><body></body></html>")
const egg = await page.evaluate(liftEgg, {
  src: `data:image/jpeg;base64,${Buffer.from(eggSource).toString("base64")}`,
  width: Math.round(EggWidth * Dpi),
})

const based = basedHouse()
const designs = [based, seedMe(await loadWordmark(), egg)]

for (const design of designs) {
  await printFiles(page, design)
  await mockups(page, design)
}
await placementGuide(page, based)

await browser.close()
