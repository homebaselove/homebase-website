import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import { chromium } from "playwright"
import HomebaseColors from "../brand/colors.json" with { type: "json" }
import { DotPitch, DotRadius, House } from "../src/ui/dots.ts"

/**
 * Writes the SeedMe banner into `print/`: SeedMe's logo followed by its name
 * in lowercase, spaced as one more letter of the word, centred on its ink, for
 * a 4 × 8 ft banner hung landscape. In the bottom right, a QR code to
 * seedme.xyz drawn in Homebase's dots, with Homebase's house in the code.
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
 * SeedMe's colours and logo, copied from seedme-xyz/SeedMe at 5e4f888:
 * `BRAND` and `iconSvg` from `frontend/src/lib/brand.ts`. Its
 * `frontend/BRAND.md` says what each is for. When the drawing changes there,
 * copy it here again and rerun.
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
 * "seedme", set as SeedMe sets its wordmark (`frontend/src/lib/wordmark.ts`):
 * Inter 4.001 Bold at optical size 18, with the font's own kerning and
 * -0.025em of tracking (-51 of its 2048 units), as outlines in font units,
 * y down, with the ink box's top-left at the origin and the baseline 1490
 * down. Set with HarfBuzz from SeedMe's `InterVariable.woff2`; set the same
 * way, "SeedMe" comes out within a unit of `WORDMARK`. Changing it means
 * setting the face again, never editing these numbers.
 */
const Wordmark = {
  width: 7473,
  height: 1513,
  d: "m493 1513q-135 0-240-40q-105-39-170-114q-66-75-83-180l282-38q19 76 72 115q54 39 145 39q85 0 134-32q49-33 49-83q0-43-36-70q-35-28-107-43l-191-38q-160-33-240-112q-80-79-80-204q0-105 58-182q58-77 162-119q104-42 245-42q133 0 232 38q98 38 157 108q59 70 76 165l-268 37q-14-59-62-97q-49-37-130-37q-74 0-123 31q-48 32-48 82q0 42 32 70q33 29 108 44l201 40q161 32 240 106q78 74 78 193q0 109-63 191q-63 81-174 126q-111 46-256 46zm1135-1q-168 0-291-70q-123-70-189-198q-66-128-66-301q0-171 66-299q66-129 186-202q120-72 280-72q112 0 207 36q95 36 166 106q71 71 111 177q40 105 40 243v83h-937v-188h791l-138 49q0-86-27-149q-28-63-80-97q-53-35-130-35q-76 0-130 35q-54 35-83 96q-28 61-28 140v132q0 93 32 158q31 65 90 98q58 34 136 34q54 0 97-16q43-15 74-45q31-29 46-72l271 39q-25 96-93 167q-67 72-169 112q-102 39-232 39zm1153 0q-168 0-291-70q-123-70-189-198q-66-128-66-301q0-171 66-299q66-129 186-202q120-72 280-72q112 0 207 36q95 36 166 106q71 71 111 177q40 105 40 243v83h-937v-188h791l-138 49q0-86-27-149q-28-63-80-97q-53-35-130-35q-76 0-130 35q-54 35-83 96q-28 61-28 140v132q0 93 32 158q31 65 90 98q58 34 136 34q54 0 97-16q43-15 74-45q31-29 46-72l271 39q-25 96-93 167q-67 72-169 112q-102 39-232 39zm1062-3q-130 0-234-67q-103-67-162-194q-59-127-59-309q0-185 60-312q61-126 164-192q104-65 229-65q90 0 152 29q62 29 102 74q41 44 63 92h8v-565h299v1490h-294v-175h-12q-23 48-64 93q-41 44-103 73q-62 28-149 28zm89-240q76 0 130-41q55-42 83-116q29-74 29-174q0-100-28-173q-29-74-83-115q-55-40-131-40q-77 0-130 41q-54 41-81 115q-28 74-28 172q0 99 28 173q28 75 81 117q54 41 130 41zm727 221v-1104h280l11 269h-21q26-100 77-163q51-64 119-94q68-30 142-30q121 0 198 75q78 75 109 226h-34q24-102 79-169q56-66 132-99q76-33 162-33q103 0 183 44q81 45 127 130q46 84 46 206v742h-298v-685q0-95-52-142q-51-46-126-46q-57 0-98 24q-42 25-64 69q-23 44-23 104v676h-288v-694q0-82-49-131q-48-48-126-48q-52 0-95 24q-43 24-67 71q-25 46-25 114v664zm2304 22q-168 0-291-70q-123-70-189-198q-66-128-66-301q0-171 66-299q66-129 186-202q120-72 280-72q112 0 207 36q95 36 166 106q71 71 111 177q40 105 40 243v83h-937v-188h791l-138 49q0-86-27-149q-28-63-80-97q-53-35-130-35q-76 0-130 35q-54 35-83 96q-28 61-28 140v132q0 93 32 158q31 65 90 98q58 34 136 34q54 0 97-16q43-15 74-45q31-29 46-72l271 39q-25 96-93 167q-67 72-169 112q-102 39-232 39z",
} as const

/**
 * The lockup at the sizes of SeedMe's share card
 * (`frontend/src/lib/shareCard.tsx`), in its pixels: the logo in a 60 square
 * and the type at its wordmark's size, the 1533-unit ink box of "SeedMe" 32
 * tall. The word follows the seed at the spacing of its own letters, and the
 * two are centred on one line.
 */
const Mark = 60
const FontUnit = 32 / 1533

/** The seed's ink, which the logo's square centres with room to spare. */
const SeedWidth = Mark * 96 * EggScale / 100
const SeedMargin = (Mark - SeedWidth) / 2

const WordWidth = Wordmark.width * FontUnit
const WordHeight = Wordmark.height * FontUnit

/**
 * The seed takes the space a round letter would: what an o leaves before the
 * s, its right side bearing (76 units) and the s's left (73) less the
 * tracking (51). The round letters of "seedme" leave 95 to 97.
 */
const Space = 98 * FontUnit

/**
 * The lockup's ink, seed to word, spans two thirds of the width. That leaves
 * 16 in clear at either end and over 14 above and below, well inside any hem,
 * grommet or pole pocket.
 */
const LockupWidth = Width * 2 / 3
const Scale = LockupWidth / (SeedWidth + Space + WordWidth)
const SeedX = (Width - LockupWidth) / 2
const Middle = Height / 2

/**
 * The QR code sits this far in from the bottom and right edges, clear of
 * hems and grommets.
 */
const CornerMargin = 3

/**
 * https://seedme.xyz (`SeedMeUrl` in src/funding.ts) as a QR code whose own
 * modules draw Homebase's house at its centre, one string a row with # for a
 * dark module: version 4 with error correction Q, mask 2.
 *
 * Decoders stop at the end of the URL and skip the pad bytes after it, but
 * the pads feed the error correction, which is linear in them, so they were
 * solved for to lay the house and a clear ring around it into the code. 79 of
 * those 81 modules came out as wanted, and drawing the house over the other 2
 * spends at most 2 of the 26 codewords Q can repair, leaving the rest for
 * scuffs and glare. Set by a scratch encoder that matches segno 1.6.6 bit for
 * bit; the rendered banner decodes with zxing-cpp and OpenCV.
 */
const Qr = [
  "#######.#...#...#.###..#..#######",
  "#.....#...#...###.##..#...#.....#",
  "#.###.#...###.##.#..#.....#.###.#",
  "#.###.#...#######..#.###..#.###.#",
  "#.###.#.##.#.........#..#.#.###.#",
  "#.....#.#.#....#.#...##...#.....#",
  "#######.#.#.#.#.#.#.#.#.#.#######",
  "..........#.###..######.#........",
  ".#######..##..##.##.....#..##...#",
  "#..#.#...###..####.#.#.#..##.##..",
  ".#.#####...#..###..#.#..###.#.###",
  "###..#...#..###.##.#.##...#.###.#",
  "#.#.#.#.#............#..###..#.##",
  ".###.#....##....#.....#....#..###",
  "##....#........###....#####..###.",
  ".#.....####...#####..#.#.###..#..",
  ".#....#.#.##.#######..####.####.#",
  "..##....###...#####...##.###.###.",
  "#.#...#.##....##.##...#....##.#..",
  ".#...#..##.#..##.##.#....#.#####.",
  "#.#...##.###.......#.##....#.#...",
  "#..#.#.#....##..#...#...##..##..#",
  "#....##..#####.##....#.....##..#.",
  "#.#.#...........######..###.##..#",
  "#....##.#.#.#..###.#..#.#####.#..",
  "........##.....#.....##.#...#.#..",
  "#######.######.##.#..#.##.#.#.###",
  "#.....#.#.#..#..#..#.####...###.#",
  "#.###.#.#......#..##.#..######.##",
  "#.###.#.#.###.#.##..#.####..#.##.",
  "#.###.#.###.###.#..#.#.##.##.##..",
  "#.....#.#..###.##.#.###.###.#.#..",
  "#######........#..###.##..##.###.",
]

/**
 * Each module is 0.26 in, a whole 39 px at the PNG's 150 ppi, so the code
 * lands on pixels. Scanners want four modules of light around it.
 */
const QrModule = 0.26
const QrQuiet = 4
const QrSize = (Qr.length + 2 * QrQuiet) * QrModule

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

/**
 * The QR code in Homebase's dots: Homebase blue on white, as the brand kit
 * sets its logo on light ground, every module a dot 80% of the pitch, in the
 * kit's own units, and the house from the kit's dot map at the centre. The
 * three eyes stay solid squares: a decoder finds the code by them, and
 * rounded ones lost it in testing.
 */
function qr(x: number, y: number) {
  const n = Qr.length
  const side = (n + 2 * QrQuiet) * DotPitch
  const top = (n - House.rows) / 2
  const house = new Set(
    House.dots.map((dot) => `${dot.x + top},${dot.y + top}`),
  )
  // The house and the ring kept clear around it.
  const nearHouse = (col: number, row: number) =>
    col >= top - 1
    && col <= top + House.columns
    && row >= top - 1
    && row <= top + House.rows
  const inEye = (col: number, row: number) =>
    (col < 7 || col >= n - 7) && row < 7 || col < 7 && row >= n - 7
  const at = (cell: number) => (cell + QrQuiet) * DotPitch

  const dots = Qr.flatMap((line, row) =>
    [...line].flatMap((module, col) => {
      const dark = nearHouse(col, row)
        ? house.has(`${col},${row}`)
        : module === "#"
      const cx = at(col) + DotPitch / 2
      const cy = at(row) + DotPitch / 2
      return dark && !inEye(col, row)
        ? [`<circle cx="${cx}" cy="${cy}" r="${DotRadius}"/>`]
        : []
    })
  )
  const eyes = [[0, 0], [n - 7, 0], [0, n - 7]].flatMap(([col, row]) =>
    [0, 1, 2].map((ring) => {
      const ex = at(col + ring)
      const ey = at(row + ring)
      const size = (7 - 2 * ring) * DotPitch
      const fill = ring === 1 ? ` fill="${HomebaseColors.white.hex}"` : ""
      return `<rect x="${ex}" y="${ey}" width="${size}" height="${size}"${fill}/>`
    })
  )

  return `<svg ${place(x, y, QrSize, QrSize)} viewBox="0 0 ${side} ${side}">
  <rect width="${side}" height="${side}" rx="${DotPitch * 1.5}" fill="${HomebaseColors.white.hex}"/>
  <g fill="${HomebaseColors.blue.hex}">${eyes.join("")}${dots.join("")}</g>
</svg>`
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Width} ${Height}" width="${Width}in" height="${Height}in">`,
  `<title>SeedMe</title>`,
  `<rect width="${Width}" height="${Height}" fill="${Brand.ink}"/>`,
  logo(SeedX - SeedMargin * Scale, Middle - Mark * Scale / 2, Mark * Scale),
  wordmark(
    SeedX + (SeedWidth + Space) * Scale,
    Middle - WordHeight * Scale / 2,
    WordWidth * Scale,
    WordHeight * Scale,
  ),
  qr(Width - CornerMargin - QrSize, Height - CornerMargin - QrSize),
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
