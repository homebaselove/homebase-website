import { expect, test } from "bun:test"
import {
  avatarSvg,
  enclosing,
  Lines,
  lockup,
  type Metrics,
  Reach,
} from "./telegram-avatar.ts"

/** Lato Bold’s proportions at 1000 px, near enough to test the rules with. */
const size = 1000

const metrics: Metrics = {
  cap: 720,
  lines: Lines.map((line) => ({
    left: 50,
    right: 530 * line.length,
    ascent: 740,
    descent: 10,
  })),
}

const placed = lockup(metrics, size)

test("the lettering is the kit’s: Based House over Mumbai, in Lato", () => {
  const svg = avatarSvg(placed, 1280)

  expect(
    placed.lines.map((line) => line.text),
  )
    .toEqual([
      "Based House",
      "Mumbai",
    ])

  expect(
    svg,
  )
    .toContain(`font-family="Lato" font-weight="700"`)
})

test("every dot and every line stays inside the circle Telegram crops to", () => {
  const svg = avatarSvg(placed, 1000)
  const dots = [
    ...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g),
  ]
    .map(([, cx, cy, r]) =>
      Math.hypot(Number(cx) - 500, Number(cy) - 500) + Number(r)
    )

  expect(
    Math.max(...dots),
  )
    .toBeLessThanOrEqual(500 * Reach + 0.01)

  // The same scale the SVG uses, applied to the corners of each line’s ink.
  const scale = (500 * Reach) / enclosing(placed)
  const corners = placed.inks.flatMap((ink) => [
    Math.hypot(ink.left, ink.top),
    Math.hypot(ink.right, ink.top),
    Math.hypot(ink.left, ink.bottom),
    Math.hypot(ink.right, ink.bottom),
  ])

  expect(
    Math.max(...corners) * scale,
  )
    .toBeLessThanOrEqual(500 * Reach + 1e-9)
})

test("the house and both lines share one axis down the middle", () => {
  for (const ink of placed.inks) {
    expect(
      (ink.left + ink.right) / 2,
    )
      .toBeCloseTo(0, 9)
  }

  expect(
    Math.min(...placed.dots.map((dot) => dot.x))
      + Math.max(...placed.dots.map((dot) => dot.x)),
  )
    .toBe(0)
})

test("the lettering sits under the house, and the lockup a little above the middle", () => {
  const houseBottom = Math.max(...placed.dots.map((dot) => dot.y + dot.r))
  const top = Math.min(...placed.dots.map((dot) => dot.y - dot.r))
  const bottom = Math.max(...placed.inks.map((ink) => ink.bottom))

  expect(
    placed.inks[0].top,
  )
    .toBeGreaterThan(houseBottom)

  expect(
    placed.lines[1].baseline,
  )
    .toBeGreaterThan(placed.lines[0].baseline)

  expect(
    -top,
  )
    .toBeGreaterThan(bottom)
})

test("the avatar is Homebase Blue on white and nothing else", () => {
  const fills = [...avatarSvg(placed, 640).matchAll(/fill="([^"]+)"/g)]
    .map(([, fill]) => fill)

  expect(
    [...new Set(fills)].sort(),
  )
    .toEqual([
      "#0000FF",
      "#FFFFFF",
    ])
})
