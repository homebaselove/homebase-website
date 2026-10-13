/// <reference lib="dom" />
/**
 * Builds the shirt print files and the mockups.
 *
 *   bun merch/build.ts
 *
 * Print files land in merch/print at 300 DPI, mockups in merch/mockups.
 * Needs the Chromium Playwright drives (`bunx playwright install chromium`).
 */
import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import * as NUrl from "node:url"
import { chromium, type Page } from "playwright"
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
import { Canvas, shirtLayers, type Side } from "./shirt.ts"

const Here = NPath.dirname(NUrl.fileURLToPath(import.meta.url))

const PrintDir = NPath.join(Here, "print")

const MockupDir = NPath.join(Here, "mockups")

const Dpi = 300

/** Mockup pixels per garment inch. */
const MockupScale = 120

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

await NFs.mkdir(PrintDir, { recursive: true })
await NFs.mkdir(MockupDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()

const eggSource = await Bun
  .file(NPath.join(Here, "source/seedme-egg.jpg"))
  .arrayBuffer()
await page.setContent("<!doctype html><html><body></body></html>")
const egg = await page.evaluate(liftEgg, {
  src: `data:image/jpeg;base64,${Buffer.from(eggSource).toString("base64")}`,
  width: Math.round(EggWidth * Dpi),
})

const designs = [basedHouse(), seedMe(await loadWordmark(), egg)]

for (const design of designs) {
  await printFiles(page, design)
  await mockups(page, design)
}

await browser.close()
