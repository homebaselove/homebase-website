import { expect, test } from "bun:test"
import { avatarSvg, HomebaseBlue, lockup, Reach } from "./avatar.ts"

const circles = (svg: string) =>
  [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)]
    .map(([, cx, cy, r]) => ({
      cx: Number(cx),
      cy: Number(cy),
      r: Number(r),
    }))

test("every dot stays inside the circle Telegram crops to", () => {
  const size = 1000
  const dots = circles(avatarSvg(size))
  const farthest = Math.max(
    ...dots.map((dot) =>
      Math.hypot(dot.cx - size / 2, dot.cy - size / 2) + dot.r
    ),
  )

  expect(
    dots.length,
  )
    .toBe(lockup().length)

  expect(
    farthest,
  )
    .toBeCloseTo((size / 2) * Reach, 2)
})

test("the lockup is in the logo blue on white and nothing else", () => {
  const colours = [...avatarSvg(640).matchAll(/fill="([^"]+)"/g)]
    .map(([, colour]) => colour)

  expect(
    [...new Set(colours)].sort(),
  )
    .toEqual([
      "#0000ff",
      "#ffffff",
    ])

  expect(
    HomebaseBlue,
  )
    .toBe("#0000ff")
})

test("the lockup is centred across and sits a little above the middle", () => {
  const spots = lockup()
  const left = Math.min(...spots.map((spot) => spot.x - spot.r))
  const right = Math.max(...spots.map((spot) => spot.x + spot.r))
  const top = Math.min(...spots.map((spot) => spot.y - spot.r))
  const bottom = Math.max(...spots.map((spot) => spot.y + spot.r))

  expect(
    left + right,
  )
    .toBeCloseTo(0, 9)

  expect(
    -top,
  )
    .toBeGreaterThan(bottom)

  expect(
    (-top - bottom) / (bottom - top),
  )
    .toBeLessThan(0.1)
})
