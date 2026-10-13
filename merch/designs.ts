import { type DotMap, DotPitch, DotRadius, House } from "../src/ui/dots.ts"
import type { Space } from "./geometry.ts"
import { block } from "./lettering.ts"
import type { Fabric, Side } from "./shirt.ts"

/**
 * Art on the garment. Bounds are inches: x from the centre line (positive
 * is the wearer’s left on the front, their right on the back, which is the
 * viewer’s right either way), y down from the high point of the shoulder.
 */
export interface Artwork {
  x: number
  y: number
  width: number
  height: number
  draw: (s: Space) => string
}

export interface Design {
  slug: string
  title: string
  fabric: Fabric
  prints: Record<Side, Artwork[]>
}

export const Ink = "#ffffff"

/** Homebase blue, the site’s `--color-brand`. */
export const BaseBlue: Fabric = {
  color: "#0000ff",
  thread: "#3d3dff",
  relief: 0.9,
  sheen: 0.035,
}

export const Black: Fabric = {
  color: "#161618",
  thread: "#2c2c31",
  relief: 1,
  sheen: 0.05,
}

export function dots(
  map: DotMap,
  x: number,
  y: number,
  pitch: number,
): Artwork {
  const r = (DotRadius / DotPitch) * pitch

  return {
    x,
    y,
    width: map.columns * pitch,
    height: map.rows * pitch,
    draw: (s) =>
      `<g fill="${Ink}">${
        map
          .dots
          .map((dot) =>
            `<circle cx="${s.x(x + (dot.x + 0.5) * pitch)}" cy="${
              s.y(y + (dot.y + 0.5) * pitch)
            }" r="${s.len(r)}"/>`
          )
          .join("")
      }</g>`,
  }
}

export interface Vector {
  path: string
  width: number
  height: number
}

export function vector(
  art: Vector,
  centerX: number,
  centerY: number,
  width: number,
): Artwork {
  const height = (width / art.width) * art.height
  const x = centerX - width / 2
  const y = centerY - height / 2

  return {
    x,
    y,
    width,
    height,
    draw: (s) =>
      `<path fill="${Ink}" transform="translate(${s.x(x)} ${s.y(y)}) scale(${
        s.len(width) / art.width
      })" d="${art.path}"/>`,
  }
}

export interface Raster {
  /** Base64 PNG. */
  png: string
  width: number
  height: number
}

export function raster(
  art: Raster,
  centerX: number,
  top: number,
  width: number,
): Artwork {
  const height = (width / art.width) * art.height
  const x = centerX - width / 2

  return {
    x,
    y: top,
    width,
    height,
    draw: (s) =>
      `<image href="data:image/png;base64,${art.png}" x="${s.x(x)}" y="${
        s.y(top)
      }" width="${s.len(width)}" height="${
        s.len(height)
      }" preserveAspectRatio="none"/>`,
  }
}

/** Left chest, sized and placed as on the reference shirt. */
const Chest = {
  centerX: 3.6,
  top: 5.6,
  width: 3,
}

/** Pitch of the shoulder lettering: about 2 mm between dot centres. */
const LetteringPitch = 0.08

/** How far the shoulder blocks reach from the centre line. */
const ShoulderReach = 6.9

const ShoulderTop = 2.6

export const EggWidth = 5.75

export function basedHouse(): Design {
  const housePitch = Chest.width / House.columns
  const left = block(["Based House", "Mumbai"], "left")
  const right = block(["Devcon", "2026"], "right")

  return {
    slug: "based-house",
    title: "Based House Mumbai",
    fabric: BaseBlue,
    prints: {
      front: [
        dots(House, Chest.centerX - Chest.width / 2, Chest.top, housePitch),
      ],
      back: [
        dots(left, -ShoulderReach, ShoulderTop, LetteringPitch),
        dots(
          right,
          ShoulderReach - right.columns * LetteringPitch,
          ShoulderTop,
          LetteringPitch,
        ),
      ],
    },
  }
}

export function seedMe(wordmark: Vector, egg: Raster): Design {
  return {
    slug: "seedme",
    title: "SeedMe",
    fabric: Black,
    prints: {
      front: [
        vector(wordmark, Chest.centerX, Chest.top + Chest.width / 2, 3.25),
      ],
      back: [
        raster(egg, 0, 4.25, EggWidth),
      ],
    },
  }
}

export function bounds(artworks: readonly Artwork[]) {
  const x = Math.min(...artworks.map((art) => art.x))
  const y = Math.min(...artworks.map((art) => art.y))

  return {
    x,
    y,
    width: Math.max(...artworks.map((art) => art.x + art.width)) - x,
    height: Math.max(...artworks.map((art) => art.y + art.height)) - y,
  }
}
