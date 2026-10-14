import { DotPitch, DotRadius, House } from "../src/ui/dots.ts"
import { block } from "./lettering.ts"

/**
 * The Based House Mumbai lockup for Telegram: the dot house over BASED
 * HOUSE / MUMBAI in the shirt lettering, Homebase blue on white. Telegram
 * shows an avatar as the circle inside the square, so the lockup is sized
 * by the circle that holds it rather than by its box.
 */

/** Homebase blue, the site’s `--color-brand` and the logo’s blue. */
export const HomebaseBlue = "#0000ff"

/** House dots stand this many lettering dots apart. */
const HouseScale = 5

/** Space between the house and the lettering, in house dots. */
const Gap = 1.2

/** How far toward the edge of Telegram’s circle the lockup reaches. */
export const Reach = 0.84

/** How far above the middle the lockup sits, as a share of its height. */
const OpticalLift = 0.025

export interface Spot {
  x: number
  y: number
  r: number
}

const Ratio = DotRadius / DotPitch

/**
 * Every dot of the lockup in lettering dots, about the middle of the avatar:
 * centred on its box, then raised a little, since a mark centred exactly
 * looks low.
 */
export function lockup(): Spot[] {
  const lettering = block(["Based House", "Mumbai"], "center")
  const letteringTop = (House.rows - 1) * HouseScale
    + Ratio * HouseScale
    + Gap * HouseScale
    + Ratio
  const spots = [
    ...House.dots.map((dot) => ({
      x: (dot.x - (House.columns - 1) / 2) * HouseScale,
      y: dot.y * HouseScale,
      r: Ratio * HouseScale,
    })),
    ...lettering.dots.map((dot) => ({
      x: dot.x - (lettering.columns - 1) / 2,
      y: letteringTop + dot.y,
      r: Ratio,
    })),
  ]
  const top = Math.min(...spots.map((spot) => spot.y - spot.r))
  const bottom = Math.max(...spots.map((spot) => spot.y + spot.r))
  const center = (top + bottom) / 2 + OpticalLift * (bottom - top)

  return spots.map((spot) => ({
    ...spot,
    y: spot.y - center,
  }))
}

/** Radius of the circle about the middle that just holds every dot. */
export function enclosing(spots: readonly Spot[]) {
  return Math.max(...spots.map((spot) => Math.hypot(spot.x, spot.y) + spot.r))
}

/** A square avatar `size` pixels wide, white, the lockup in Homebase blue. */
export function avatarSvg(size: number) {
  const spots = lockup()
  const scale = ((size / 2) * Reach) / enclosing(spots)
  const at = (value: number) => +(size / 2 + value * scale).toFixed(3)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="#ffffff"/>`
    + `<g fill="${HomebaseBlue}">${
      spots
        .map((spot) =>
          `<circle cx="${at(spot.x)}" cy="${at(spot.y)}" r="${+(spot.r * scale)
            .toFixed(3)}"/>`
        )
        .join("")
    }</g></svg>\n`
}
