import { expect, test } from "bun:test"
import { House } from "../src/ui/dots.ts"
import { block, GlyphRows, line } from "./lettering.ts"

test("a line of lettering stands as tall as the house", () => {
  expect(
    line("Based House").rows,
  )
    .toBe(House.rows)

  expect(
    GlyphRows,
  )
    .toBe(House.rows)
})

test("letters sit one column apart, words four", () => {
  expect(
    line("Devcon").columns,
  )
    .toBe(6 * 5 + 5)

  expect(
    line("Based House").columns,
  )
    .toBe(10 * 5 + 8 + 4)
})

test("every dot lands inside its line", () => {
  for (const text of ["Based House", "Mumbai", "Devcon", "2026"]) {
    const map = line(text)

    expect(
      map.dots.every((dot) =>
        dot.x >= 0
        && dot.x < map.columns
        && dot.y >= 0
        && dot.y < map.rows
      ),
    )
      .toBe(true)
  }
})

test("a right-aligned block ends every line on its right edge", () => {
  const map = block(["Devcon", "2026"], "right")
  const lastColumn = (row: number) =>
    Math.max(
      ...map
        .dots
        .filter((dot) => dot.y >= row && dot.y < row + GlyphRows)
        .map((dot) => dot.x),
    )

  expect(
    map.rows,
  )
    .toBe(GlyphRows * 2 + 2)

  expect(
    [
      lastColumn(0),
      lastColumn(GlyphRows + 2),
    ],
  )
    .toEqual([
      map.columns - 1,
      map.columns - 1,
    ])
})

test("a left-aligned block starts every line at its left edge", () => {
  const map = block(["Based House", "Mumbai"], "left")
  const firstColumn = (row: number) =>
    Math.min(
      ...map
        .dots
        .filter((dot) => dot.y >= row && dot.y < row + GlyphRows)
        .map((dot) => dot.x),
    )

  expect(
    [
      firstColumn(0),
      firstColumn(GlyphRows + 2),
    ],
  )
    .toEqual([
      0,
      0,
    ])
})

test("a centred block puts every line on the same axis", () => {
  const map = block(["Based House", "Mumbai"], "center")
  const axis = (row: number) => {
    const xs = map
      .dots
      .filter((dot) => dot.y >= row && dot.y < row + GlyphRows)
      .map((dot) => dot.x)

    return (Math.min(...xs) + Math.max(...xs)) / 2
  }

  expect(
    axis(GlyphRows + 2),
  )
    .toBe(axis(0))

  expect(
    axis(0),
  )
    .toBe((map.columns - 1) / 2)
})

test("text without a glyph is refused rather than dropped", () => {
  expect(
    () => line("Goa"),
  )
    .toThrow("No dot-matrix glyph")
})
