import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import { chromium } from "playwright"

/**
 * Writes the SeedMe banner into `print/`: SeedMe's logo and wordmark, centred
 * on its ink, for a 4 × 8 ft banner hung landscape.
 *
 * - `seedme-banner-4x8ft.pdf`: one 96 × 48 in page, the size it prints at.
 *   All of it is vector but the logo's soft inner shadow, which Chromium
 *   rasterizes at 300 ppi.
 * - `seedme-banner-4x8ft.png`: 14400 × 7200, 150 ppi at full size and tagged
 *   sRGB, for printers that ask for an image.
 * - `seedme-banner-4x8ft.svg`: the drawing both are rendered from.
 *
 * Set CHROMIUM_PATH when the local Playwright has no browser of its own.
 *
 *   bun scripts/seedme-banner.ts
 */
const OutDir = NPath.join(import.meta.dir, "..", "print")
const Name = "seedme-banner-4x8ft"

/** The banner in inches, which are the drawing's units too. */
const Width = 96
const Height = 48

/** What large-format printers ask for at a banner's viewing distance. */
const PngPpi = 150

/**
 * SeedMe's colours and drawings, copied from seedme-xyz/SeedMe at 5e4f888:
 * `BRAND` and `iconSvg` from `frontend/src/lib/brand.ts`, `WORDMARK` from
 * `frontend/src/lib/wordmark.ts`. Its `frontend/BRAND.md` says what each is
 * for. When the drawing changes there, copy it here again and rerun.
 */
const Brand = {
  ink: "#030712",
  blue: "#0052ff",
  blueHi: "#7d9eff",
} as const

/**
 * The seed: one closed curve in a 100 × 158 box, spanning x 2–98 and y 3–155.
 */
const Egg =
  "M50 3 C75 3 98 45 98 93 C98 130 77 155 50 155 C23 155 2 130 2 93 C2 45 25 3 50 3 Z"

/**
 * `iconSvg("bare")` draws the egg's box 96 units tall in its 100-unit square.
 */
const EggScale = 0.6076

/**
 * "SeedMe" set in Inter Bold as outlines: font units, the ink box at the
 * origin.
 */
const Wordmark = {
  width: 7710,
  height: 1533,
  d: "m598 1533q-182 0-315-56-133-56-207-165-73-110-76-269h297q4 76 43 129 39 52 105 78 66 27 151 27 82 0 144-24 61-24 95-67 34-43 34-99 0-51-29-86-30-35-88-60-57-25-142-44l-162-40q-196-46-304-145-107-100-107-262 0-135 73-236 72-101 198-158 127-56 291-56 166 0 289 57 124 57 193 159 69 102 72 237h-294q-8-93-77-145-70-52-185-52-77 0-133 22-56 23-86 62-29 40-29 91 0 53 31 89 32 35 88 58 55 24 124 40l136 33q99 22 182 59 82 36 142 88 60 52 92 123 32 71 32 162 0 137-69 239-69 101-198 156-129 55-311 55zm1232 0q-169 0-292-70-122-70-188-198-67-128-67-301 0-171 66-300 66-128 186-200 120-73 281-73 111 0 206 36 95 36 166 107 72 70 112 176 39 105 39 243v83h-937v-188h792l-139 49q0-86-27-149-27-63-80-98-52-34-129-34-77 0-131 35-54 35-82 96-29 61-29 140v132q0 93 32 158 32 65 91 99 58 33 136 33 53 0 96-15 44-16 74-46 31-29 47-72l271 39q-26 96-94 167-67 72-168 112-102 39-232 39zm1153 0q-169 0-291-70-123-70-190-198-66-128-66-301 0-171 66-300 66-128 186-200 120-73 281-73 111 0 206 36 95 36 167 107 71 70 110 176 40 105 40 243v83h-937v-188h792l-139 49q0-86-27-149-27-63-79-98-53-34-130-34-77 0-131 35-54 35-83 96-28 61-28 140v132q0 93 32 158 32 65 90 99 59 33 137 33 53 0 97-15 43-16 74-46 30-29 46-72l271 39q-26 96-93 167-68 72-170 112-101 39-231 39zm1062-3q-131 0-234-67-103-67-163-194-59-127-59-309 0-185 61-312 61-126 164-192 103-65 229-65 89 0 151 29 62 29 102 74 41 44 64 92h8v-565h298v1490h-294v-175h-11q-23 48-65 92-41 45-102 74-62 28-149 28zm88-240q77 0 131-42 54-41 83-115 29-74 29-174 0-100-28-173-29-74-84-114-54-41-131-41-76 0-129 41-54 41-82 115-27 74-27 172 0 99 27 173 28 75 82 116 53 42 129 42zm734 221v-1490h465l242 686q15 48 35 123 20 74 41 159 20 85 38 165 17 79 29 137h-64q12-57 29-136 18-79 38-165 21-85 40-160 20-75 36-123l238-686h466v1490h-306v-704q0-49 2-121 1-72 4-155 2-83 4-167 2-85 3-160h23q-20 82-44 169-23 87-46 169-24 83-44 152-21 68-36 113l-248 704h-256l-251-704q-16-45-37-113-20-68-44-150-24-82-48-169-24-87-46-171h28q1 72 3 156 2 84 4 168 2 84 4 156 2 73 2 123v704zm2334 22q-169 0-291-70-123-70-190-198-66-128-66-301 0-171 66-300 66-128 186-200 120-73 281-73 111 0 206 36 95 36 167 107 71 70 110 176 40 105 40 243v83h-937v-188h792l-139 49q0-86-27-149-27-63-79-98-53-34-130-34-77 0-131 35-54 35-83 96-28 61-28 140v132q0 93 32 158 32 65 90 99 59 33 137 33 53 0 97-15 43-16 74-46 30-29 46-72l271 39q-26 96-93 167-68 72-170 112-101 39-231 39z",
} as const

/**
 * The lockup as SeedMe's share card sets it (`frontend/src/lib/shareCard.tsx`),
 * in its pixels: the logo in a 60 square, a gap of 16, then the wordmark 32
 * tall, the two centred on one line.
 */
const Mark = 60
const Gap = 16
const WordmarkHeight = 32
const WordmarkWidth = WordmarkHeight * Wordmark.width / Wordmark.height

/** The seed's ink is narrower than the logo's square, which centres it. */
const SeedLeft = Mark * (50 - 48 * EggScale) / 100

/**
 * The lockup's ink, seed to wordmark, spans two thirds of the width. That
 * leaves about 16 in clear on every side, well inside any hem, grommet or
 * pole pocket.
 */
const LockupWidth = Width * 2 / 3
const Scale = LockupWidth / (Mark + Gap + WordmarkWidth - SeedLeft)
const MarkX = (Width - LockupWidth) / 2 - SeedLeft * Scale
const Middle = Height / 2

/**
 * The logo: `iconSvg("bare")`, the seed in its lit gradient with one inner
 * shadow and no ground, which BRAND.md keeps for surfaces already dark.
 */
function logo(x: number, y: number, size: number) {
  const fit = `translate(50 50) scale(${EggScale}) translate(-50 -79)`
  return `<svg ${place(x, y, size, size)} viewBox="0 0 100 100">
  <defs>
    <radialGradient id="seed-shell" cx="0.34" cy="0.24" r="0.92">
      <stop offset="0" stop-color="#c2d5ff"/>
      <stop offset="0.16" stop-color="#7ea3ff"/>
      <stop offset="0.36" stop-color="#3d76ff"/>
      <stop offset="0.58" stop-color="${Brand.blue}"/>
      <stop offset="0.82" stop-color="#0037ad"/>
      <stop offset="1" stop-color="#001e6b"/>
    </radialGradient>
    <filter id="seed-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
    <clipPath id="seed-clip"><path d="${Egg}" transform="${fit}"/></clipPath>
  </defs>
  <path d="${Egg}" fill="url(#seed-shell)" transform="${fit}"/>
  <g clip-path="url(#seed-clip)">
    <path d="${Egg}" transform="${fit} translate(-6 -7)" fill="none" stroke="#00123f" stroke-width="16" opacity="0.75" filter="url(#seed-blur)"/>
  </g>
</svg>`
}

/** The wordmark in brand-hi, as the share card and the header draw it. */
function wordmark(x: number, y: number, width: number, height: number) {
  return `<svg ${place(x, y, width, height)} viewBox="0 0 ${Wordmark.width} ${Wordmark.height}">
  <path d="${Wordmark.d}" fill="${Brand.blueHi}"/>
</svg>`
}

/** Where a nested drawing sits on the banner, in inches. */
function place(x: number, y: number, width: number, height: number) {
  return Object.entries({
    x,
    y,
    width,
    height,
  })
    .map(([name, value]) => `${name}="${Math.round(value * 1e4) / 1e4}"`)
    .join(" ")
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Width} ${Height}" width="${Width}in" height="${Height}in">`,
  `<title>SeedMe</title>`,
  `<rect width="${Width}" height="${Height}" fill="${Brand.ink}"/>`,
  logo(MarkX, Middle - Mark * Scale / 2, Mark * Scale),
  wordmark(
    MarkX + (Mark + Gap) * Scale,
    Middle - WordmarkHeight * Scale / 2,
    WordmarkWidth * Scale,
    WordmarkHeight * Scale,
  ),
  `</svg>`,
].join("\n") + "\n"

/**
 * Chromium writes its screenshots with no resolution or colour space, so a
 * print RIP would read this one at 72 ppi, as 200 × 100 in. PNG wants both
 * chunks before the image data, so they go straight after IHDR.
 */
function tagPng(png: Uint8Array, ppi: number) {
  const ihdrLength = new DataView(png.buffer, png.byteOffset).getUint32(8)
  // The signature, then IHDR's length, type, data and CRC.
  const ihdrEnd = 8 + 4 + 4 + ihdrLength + 4
  const perMetre = Math.round(ppi / 0.0254)
  const phys = new Uint8Array(9)
  const view = new DataView(phys.buffer)
  view.setUint32(0, perMetre)
  view.setUint32(4, perMetre)
  phys[8] = 1 // pHYs counts pixels per metre

  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    chunk("sRGB", Uint8Array.of(0)), // perceptual rendering intent
    chunk("pHYs", phys),
    png.subarray(ihdrEnd),
  ])
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  const crc = Bun.hash.crc32(out.subarray(4, 8 + data.length))
  view.setUint32(8 + data.length, crc)
  return out
}

await NFs.mkdir(OutDir, {
  recursive: true,
})
await NFs.writeFile(NPath.join(OutDir, `${Name}.svg`), svg)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
})

const page = await browser.newPage()
await page.setContent(
  `<title>SeedMe banner, 4 × 8 ft</title><style>@page{margin:0;size:${Width}in ${Height}in}html,body{margin:0}svg{display:block}</style>${svg}`,
)
await NFs.writeFile(
  NPath.join(OutDir, `${Name}.pdf`),
  await page.pdf({
    width: `${Width}in`,
    height: `${Height}in`,
    printBackground: true,
  }),
)

const image = await browser.newPage({
  viewport: {
    width: Width * PngPpi,
    height: Height * PngPpi,
  },
})
await image.setContent(
  `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
)
await NFs.writeFile(
  NPath.join(OutDir, `${Name}.png`),
  tagPng(await image.screenshot(), PngPpi),
)

await browser.close()
