/**
 * The Based House Mumbai avatar for Telegram: the dot house over “Based
 * House” and “Mumbai”, centred, in Lato Bold as the brand kit sets it, Homebase
 * Blue on white. Telegram shows an avatar as the circle inside the square, so
 * the lockup is sized by the circle that holds it rather than by its box.
 *
 *   bun scripts/telegram-avatar.ts
 *
 * Writes `social/`: the vector master as PDF, and a 1280 px PNG made from it
 * to upload. Lato comes from Google Fonts, so it needs the network; the PNG
 * needs pdftoppm (poppler). Set CHROMIUM_PATH when the local Playwright has
 * no browser of its own.
 */
import * as NPath from "node:path"
import colors from "../brand/colors.json" with { type: "json" }
import { DotPitch, DotRadius, House } from "../src/ui/dots.ts"
import {
  Display,
  latoPage,
  launch,
  measure,
  rasterize,
  type TextInk,
  writePdf,
} from "./render.ts"

export const Lines = ["Based House", "Mumbai"]

/**
 * Lato’s size, in house dots. Its capitals stand about a quarter of the
 * house’s height and “Based House” runs about 1.8 times its width, so the
 * house still leads at chat-list size.
 */
export const TextSize = 2.2

/** Space between the house and the lettering, in house dots. */
export const Gap = 1.2

/** How far toward the edge of Telegram’s circle the lockup reaches. */
export const Reach = 0.84

/** How far above the middle the lockup sits, as a share of its height. */
export const OpticalLift = 0.025

const Ratio = DotRadius / DotPitch

/** Lato’s cap height and each line’s ink, measured at some size in px. */
export interface Metrics {
  cap: number
  lines: TextInk[]
}

export interface Ink {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Lockup {
  dots: {
    x: number
    y: number
    r: number
  }[]
  lines: {
    text: string
    x: number
    baseline: number
  }[]
  /** Each line’s ink, from its tallest stroke to its lowest. */
  inks: Ink[]
}

/**
 * The lockup in house dots, about the middle of the avatar: centred on its
 * box, then raised a little, since a mark centred exactly looks low.
 * `metrics` are Lato’s at `size` px.
 */
export function lockup(metrics: Metrics, size: number): Lockup {
  const toDots = TextSize / size
  const leading = Display.lineHeight * TextSize
  const firstBaseline = House.rows - 1 + Ratio + Gap + metrics.cap * toDots
  const dots = House.dots.map((dot) => ({
    x: dot.x - (House.columns - 1) / 2,
    y: dot.y,
    r: Ratio,
  }))
  // Each line is centred on its ink, so neither side bearings nor the
  // tracking after the last letter pull it off the house’s axis.
  const lines = Lines.map((text, index) => {
    const ink = metrics.lines[index]

    return {
      text,
      x: (-(ink.left + ink.right) / 2) * toDots,
      baseline: firstBaseline + index * leading,
      ink,
    }
  })
  const inks = lines.map((line) => ({
    left: line.x + line.ink.left * toDots,
    right: line.x + line.ink.right * toDots,
    top: line.baseline - line.ink.ascent * toDots,
    bottom: line.baseline + line.ink.descent * toDots,
  }))
  const top = Math.min(...dots.map((dot) => dot.y - dot.r))
  const bottom = Math.max(...inks.map((ink) => ink.bottom))
  const center = (top + bottom) / 2 + OpticalLift * (bottom - top)

  return {
    dots: dots.map((dot) => ({
      ...dot,
      y: dot.y - center,
    })),
    lines: lines.map((line) => ({
      text: line.text,
      x: line.x,
      baseline: line.baseline - center,
    })),
    inks: inks.map((ink) => ({
      ...ink,
      top: ink.top - center,
      bottom: ink.bottom - center,
    })),
  }
}

/** Radius of the circle about the middle that holds every dot and line. */
export function enclosing(placed: Lockup) {
  return Math.max(
    ...placed.dots.map((dot) => Math.hypot(dot.x, dot.y) + dot.r),
    ...placed.inks.flatMap((ink) => [
      Math.hypot(ink.left, ink.top),
      Math.hypot(ink.right, ink.top),
      Math.hypot(ink.left, ink.bottom),
      Math.hypot(ink.right, ink.bottom),
    ]),
  )
}

/** A square avatar `size` px wide: white, the lockup in Homebase Blue. */
export function avatarSvg(placed: Lockup, size: number) {
  const scale = ((size / 2) * Reach) / enclosing(placed)
  const at = (value: number) => +(size / 2 + value * scale).toFixed(3)
  const fontSize = +(TextSize * scale).toFixed(3)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">`
    + `<rect width="${size}" height="${size}" fill="${colors.white.hex}"/>`
    + `<g fill="${colors.blue.hex}">${
      placed
        .dots
        .map((dot) =>
          `<circle cx="${at(dot.x)}" cy="${at(dot.y)}" r="${+(dot.r * scale)
            .toFixed(3)}"/>`
        )
        .join("")
    }</g>`
    + placed
      .lines
      .map((line) =>
        `<text x="${at(line.x)}" y="${
          at(line.baseline)
        }" fill="${colors.blue.hex}" font-family="Lato" font-weight="${Display.weight}" font-size="${fontSize}" letter-spacing="${+(Display
          .tracking * fontSize)
          .toFixed(3)}">${line.text}</text>`
      )
      .join("")
    + `</svg>`
}

if (import.meta.main) {
  const file = NPath.join(
    import.meta.dir,
    "..",
    "social",
    "based-house-mumbai-telegram",
  )
  const size = 1280
  // Measured large, for precision; Lato’s metrics scale with its size.
  const reference = 1000
  const browser = await launch()
  const page = await latoPage(browser, colors.white.hex)
  const placed = lockup(await measure(page, Lines, reference), reference)

  await writePdf(page, `${file}.pdf`, {
    svg: avatarSvg(placed, size),
    title: "Based House Mumbai, Telegram avatar",
    size: {
      width: size,
      height: size,
      unit: "px",
    },
  })
  rasterize(`${file}.pdf`, `${file}-${size}.png`, size)

  await browser.close()
  console.log(`Avatar written to ${NPath.dirname(file)}`)
}
