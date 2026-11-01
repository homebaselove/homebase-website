import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import { chromium } from "playwright"
import { BrandKitFile, BrandKitZipUrl } from "../src/brand.ts"
import { type DotMap, DotPitch, DotRadius, House, word } from "../src/ui/dots.ts"

/**
 * Writes the brand kit into `brand/`: every logo as SVG, PDF and PNG, the app
 * icons and social images, and the colour tokens. Each file is drawn from the
 * same dot maps the site renders, so nothing is traced by hand. The kit as a
 * slide deck (`scripts/brand-deck.html`) and a zip of `brand/` go to public,
 * where the site links them.
 *
 * Needs ImageMagick (`convert`) for the favicon and the icons that must carry
 * no alpha channel, and `zip`. Set CHROMIUM_PATH when the local Playwright has no browser
 * of its own.
 *
 *   bun scripts/brand-kit.ts
 */
const OutDir = "brand"

const Colors = {
  blue: "#0000FF",
  white: "#FFFFFF",
  ink: "#18181B",
} as const

type ColorName = keyof typeof Colors

interface Circle {
  cx: number
  cy: number
  r: number
}

interface Art {
  width: number
  height: number
  circles: Circle[]
}

/**
 * How much bigger the house is drawn than the wordmark in the stacked lockup,
 * and the gap between them, dot edge to dot edge in wordmark units: both
 * measured from public/OpenGraphImage.png, where the house rows sit 21.41 px
 * apart and the letter rows 6.48 px.
 */
const StackedHouseScale = 3.3
const StackedGap = 77

const HorizontalGap = 60

function circles(map: DotMap, scale: number, dx: number, dy: number): Circle[] {
  return map.dots.map((dot) => ({
    cx: dx + (dot.x * DotPitch + DotPitch / 2) * scale,
    cy: dy + (dot.y * DotPitch + DotPitch / 2) * scale,
    r: DotRadius * scale,
  }))
}

/** Crops to the dots, keeping the same breathing room the site's viewBox gives them. */
function fit(all: Circle[], margin: number): Art {
  const minX = Math.min(...all.map((c) => c.cx - c.r)) - margin
  const minY = Math.min(...all.map((c) => c.cy - c.r)) - margin
  const maxX = Math.max(...all.map((c) => c.cx + c.r)) + margin
  const maxY = Math.max(...all.map((c) => c.cy + c.r)) + margin

  return {
    width: round(maxX - minX),
    height: round(maxY - minY),
    circles: all.map((c) => ({
      cx: round(c.cx - minX),
      cy: round(c.cy - minY),
      r: round(c.r),
    })),
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

const Wordmark = word("HOMEBASE")
const Margin = DotPitch / 2 - DotRadius

function mark(): Art {
  return fit(circles(House, 1, 0, 0), Margin)
}

function wordmark(): Art {
  return fit(circles(Wordmark, 1, 0, 0), Margin)
}

function stacked(): Art {
  const houseWidth = House.columns * DotPitch * StackedHouseScale
  const wordWidth = Wordmark.columns * DotPitch
  const house = circles(House, StackedHouseScale, (wordWidth - houseWidth) / 2, 0)
  const houseBottom = Math.max(...house.map((c) => c.cy + c.r))
  const wordTop = houseBottom + StackedGap - Margin

  return fit([...house, ...circles(Wordmark, 1, 0, wordTop)], Margin)
}

/** The house stands as tall as the letters beside it. */
function horizontal(): Art {
  const wordSpan = Wordmark.rows * DotPitch - 2 * Margin
  const houseSpan = House.rows * DotPitch - 2 * Margin
  const scale = wordSpan / houseSpan
  const house = circles(House, scale, 0, Margin - Margin * scale)
  const houseRight = Math.max(...house.map((c) => c.cx + c.r))

  return fit([
    ...house,
    ...circles(Wordmark, 1, houseRight + HorizontalGap - Margin, 0),
  ], Margin)
}

const Lockups = {
  mark: mark(),
  wordmark: wordmark(),
  stacked: stacked(),
  horizontal: horizontal(),
}

function svg(art: Art, fill: string, background?: string, size?: { width: number; height: number; padding: number }) {
  const view = size
    ? (() => {
      const scale = Math.min(
        (size.width - 2 * size.padding) / art.width,
        (size.height - 2 * size.padding) / art.height,
      )
      const x = (size.width - art.width * scale) / 2
      const y = (size.height - art.height * scale) / 2
      return {
        width: size.width,
        height: size.height,
        transform: `translate(${round(x)} ${round(y)}) scale(${round(scale * 1e4) / 1e4})`,
      }
    })()
    : {
      width: art.width,
      height: art.height,
      transform: undefined,
    }

  const dots = art.circles
    .map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`)
    .join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" width="${view.width}" height="${view.height}">`,
    `<title>Homebase</title>`,
    background ? `<rect width="100%" height="100%" fill="${background}"/>` : "",
    `<g fill="${fill}"${view.transform ? ` transform="${view.transform}"` : ""}>${dots}</g>`,
    `</svg>`,
  ].join("") + "\n"
}

async function write(path: string, content: string | Uint8Array) {
  const full = NPath.join(OutDir, path)
  await NFs.mkdir(NPath.dirname(full), {
    recursive: true,
  })
  await NFs.writeFile(full, content)
}

function pad(art: Art, by: number): Art {
  return {
    width: round(art.width + 2 * by),
    height: round(art.height + 2 * by),
    circles: art.circles.map((c) => ({
      ...c,
      cx: round(c.cx + by),
      cy: round(c.cy + by),
    })),
  }
}

/**
 * Files with a solid ground are written as plain 24-bit RGB: the Base mini app
 * icon must carry no alpha channel at all, and the others gain nothing by one.
 */
function removeAlpha(path: string) {
  magick(path, "-background", Colors.blue, "-alpha", "remove", "-alpha", "off", `PNG24:${path}`)
}

function magick(...args: string[]) {
  const result = Bun.spawnSync(["convert", ...args])
  if (result.exitCode !== 0) {
    throw new Error(`convert ${args.join(" ")}: ${result.stderr.toString()}`)
  }
}

// The README is written by hand, so only the generated folders are cleared.
for (const generated of ["logo", "icon", "social"]) {
  await NFs.rm(NPath.join(OutDir, generated), {
    recursive: true,
    force: true,
  })
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
})
const page = await browser.newPage()

/**
 * Lato comes from Google Fonts; without it Chromium falls back to another
 * face and says nothing. `document.fonts.ready` can settle before a face has
 * started to load, so each weight is asked for by name.
 */
async function awaitLato(weights: readonly number[]) {
  const missing = await page.evaluate(async (weights) => {
    const fonts = weights.map((weight) => `${weight} 16px Lato`)
    await Promise.all(fonts.map((font) => document.fonts.load(font)))
    return fonts.filter((font) => !document.fonts.check(font))
  }, weights)
  if (missing.length > 0) {
    throw new Error(`Lato did not load from Google Fonts (${missing.join(", ")}); check the network and run again`)
  }
}

async function png(path: string, markup: string, width: number, height: number) {
  await page.setViewportSize({
    width,
    height,
  })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${markup}`,
  )
  const full = NPath.join(OutDir, path)
  await NFs.mkdir(NPath.dirname(full), {
    recursive: true,
  })
  await page.screenshot({
    path: full,
    omitBackground: true,
  })
  return full
}

async function pdf(path: string, markup: string, art: Art) {
  // Circles stay circles in the PDF, so it prints sharp at any size.
  await page.setContent(
    `<style>@page{margin:0;size:${art.width}px ${art.height}px}html,body{margin:0}svg{display:block}</style>${markup}`,
  )
  await write(
    path,
    await page.pdf({
      width: `${art.width}px`,
      height: `${art.height}px`,
      printBackground: true,
    }),
  )
}

/** The longest side of each PNG: big enough for print at 300 dpi up to about 35 cm wide. */
const PngLongSide = {
  mark: 4096,
  wordmark: 8192,
  stacked: 4096,
  horizontal: 8192,
}

for (const [name, art] of Object.entries(Lockups) as [keyof typeof Lockups, Art][]) {
  for (const color of Object.keys(Colors) as ColorName[]) {
    const file = `homebase-${name}-${color}`
    const markup = svg(art, Colors[color])
    await write(`logo/svg/${file}.svg`, markup)
    await pdf(`logo/pdf/${file}.pdf`, markup, art)

    const scale = PngLongSide[name] / Math.max(art.width, art.height)
    await png(
      `logo/png/${file}.png`,
      markup,
      Math.round(art.width * scale),
      Math.round(art.height * scale),
    )
  }

  // The logo reversed out of the brand blue, the way the site shows it, with
  // a fifth of its height clear on every side.
  const framed = pad(art, art.height * 0.2)
  const onBlue = svg(framed, Colors.white, Colors.blue)
  await write(`logo/svg/homebase-${name}-white-on-blue.svg`, onBlue)
  await pdf(`logo/pdf/homebase-${name}-white-on-blue.pdf`, onBlue, framed)
  const scale = PngLongSide[name] / Math.max(framed.width, framed.height)
  const full = await png(
    `logo/png/homebase-${name}-white-on-blue.png`,
    onBlue,
    Math.round(framed.width * scale),
    Math.round(framed.height * scale),
  )
  removeAlpha(full)
}

/**
 * Square icons: the white house on blue, with a quarter of the side left
 * clear around it so circular and rounded crops never touch the dots.
 */
async function icon(path: string, side: number, padding = 0.25, opaque = true) {
  const markup = svg(Lockups.mark, Colors.white, opaque ? Colors.blue : undefined, {
    width: side,
    height: side,
    padding: side * padding,
  })
  const full = await png(path, markup, side, side)
  if (opaque) {
    removeAlpha(full)
  }
  return {
    full,
    markup,
  }
}

const appIcon = await icon("icon/homebase-app-icon-1024.png", 1024)
await write("icon/homebase-app-icon.svg", appIcon.markup)
await icon("icon/homebase-avatar-400.png", 400, 0.28)
await icon("icon/homebase-splash-200.png", 200, 0.2, false)

// The sizes go into one .ico and are not kept on their own.
const favicons = []
for (const side of [16, 32, 48]) {
  favicons.push((await icon(`icon/favicon-${side}.png`, side, 0.08)).full)
}
magick(...favicons, NPath.join(OutDir, "icon/favicon.ico"))
for (const favicon of favicons) {
  await NFs.rm(favicon)
}

const Tagline = "Where based builders and creators come to grow."

/** A banner: the stacked lockup, optionally with the tagline under it, centred on blue. */
async function banner(path: string, width: number, height: number, logoWidth: number, tagline: boolean) {
  const art = Lockups.stacked
  const logoHeight = art.height * logoWidth / art.width
  const taglineSize = Math.round(logoWidth * 0.045)
  const markup = svg(art, Colors.white)
  await page.setViewportSize({
    width,
    height,
  })
  await page.setContent(`
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0}
      body{width:${width}px;height:${height}px;background:${Colors.blue};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Lato,sans-serif}
      svg{width:${logoWidth}px;height:${logoHeight}px;display:block}
      p{margin:${Math.round(taglineSize * 1.6)}px 0 0;color:#fff;opacity:.85;font-size:${taglineSize}px}
    </style>
    ${markup}${tagline ? `<p>${Tagline}</p>` : ""}`)
  await awaitLato([400])
  const full = NPath.join(OutDir, path)
  await NFs.mkdir(NPath.dirname(full), {
    recursive: true,
  })
  await page.screenshot({
    path: full,
  })
  removeAlpha(full)
}

await banner("social/homebase-og-1200x630.png", 1200, 630, 718, true)
await banner("social/homebase-x-header-1500x500.png", 1500, 500, 640, false)

/** The house on its grid, with the pitch and the dot measured, for the construction slide. */
function construction() {
  const on = new Set(House.dots.map((dot) => `${dot.x},${dot.y}`))
  const parts: string[] = []

  for (let i = 0; i <= House.columns; i++) {
    parts.push(
      `<line class="grid-line" x1="${i * DotPitch}" y1="0" x2="${i * DotPitch}" y2="70"/>`,
      `<line class="grid-line" x1="0" y1="${i * DotPitch}" x2="70" y2="${i * DotPitch}"/>`,
    )
  }

  for (let y = 0; y < House.rows; y++) {
    for (let x = 0; x < House.columns; x++) {
      parts.push(
        `<circle class="${on.has(`${x},${y}`) ? "dot" : "ghost"}" cx="${x * DotPitch + DotPitch / 2}" cy="${
          y * DotPitch + DotPitch / 2
        }" r="${DotRadius}"/>`,
      )
    }
  }

  parts.push(
    `<line class="dim" x1="0" y1="-4" x2="10" y2="-4"/><line class="dim" x1="0" y1="-5.5" x2="0" y2="-2.5"/><line class="dim" x1="10" y1="-5.5" x2="10" y2="-2.5"/><text class="dim-text" x="12" y="-2.8">10 pitch</text>`,
    `<line class="dim" x1="1" y1="75" x2="9" y2="75"/><line class="dim" x1="1" y1="73.5" x2="1" y2="76.5"/><line class="dim" x1="9" y1="73.5" x2="9" y2="76.5"/><text class="dim-text" x="11" y="76.3">8 dot · 2 gap</text>`,
  )

  return `<svg viewBox="-3 -10 76 90" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`
}

/** A `{{svg:lockup-color}}` placeholder in the deck, or the app icon. */
function deckLogo(name: string) {
  if (name === "app-icon") {
    return appIcon.markup
  }

  const [lockup, color] = name.split("-") as [keyof typeof Lockups, string]

  // The misuse slide shows the logo in a colour it must never take.
  return svg(Lockups[lockup], color === "red" ? "#FF3B30" : Colors[color as ColorName])
}

let deck = await NFs.readFile(NPath.join(import.meta.dir, "brand-deck.html"), "utf8")
for (const placeholder of new Set(deck.match(/\{\{svg:[\w-]+\}\}/g))) {
  deck = deck.replaceAll(placeholder, deckLogo(placeholder.slice(6, -2)))
}
deck = deck.replace("{{construction}}", construction())
const slides = deck.match(/class="slide/g)?.length ?? 0
let slide = 1
deck = deck.replace(/\{\{page\}\}/g, () => `${++slide} / ${slides}`)

await page.setViewportSize({
  width: 1280,
  height: 720,
})
await page.setContent(deck)
await awaitLato([300, 400, 700, 900])
await page.pdf({
  path: NPath.join("public", BrandKitFile),
  width: "1280px",
  height: "720px",
  printBackground: true,
})

await browser.close()

await write(
  "colors.json",
  JSON.stringify(
    {
      blue: {
        hex: Colors.blue,
        rgb: [0, 0, 255],
        hover: "#0000CC",
      },
      white: {
        hex: Colors.white,
        rgb: [255, 255, 255],
      },
      ink: {
        hex: Colors.ink,
        rgb: [24, 24, 27],
        oklch: "oklch(21% 0.006 285.885)",
      },
    },
    null,
    2,
  ) + "\n",
)

await write(
  "colors.css",
  `:root {
  --homebase-blue: ${Colors.blue};
  --homebase-blue-hover: #0000cc;
  --homebase-white: ${Colors.white};
  --homebase-ink: ${Colors.ink};
  --homebase-font: "Lato", ui-sans-serif, system-ui, sans-serif;
}
`,
)

const zipPath = NPath.resolve("public", BrandKitZipUrl.slice(1))
await NFs.rm(zipPath, {
  force: true,
})
const zipped = Bun.spawnSync(["zip", "-qrX", zipPath, OutDir])
if (zipped.exitCode !== 0) {
  throw new Error(`zip: ${zipped.stderr.toString()}`)
}

console.log(`Brand kit written to ${OutDir}/, public${BrandKitFile} and public${BrandKitZipUrl}`)
