import { expect, test } from "bun:test"
import { House, word } from "./dots.ts"

const size = (letter: string) =>
  `${word(letter).columns} × ${word(letter).rows}`

// A letter drawn to any other block would sit off the line beside the kit's own.
test("every letter is a block 15 cells tall and 11 wide, 13 for the M", () => {
  expect(
    Object.fromEntries(
      "ABCDEHMOSY"
        .split("")
        .map((letter) => [letter, size(letter)]),
    ),
  )
    .toEqual({
      A: "11 × 15",
      B: "11 × 15",
      C: "11 × 15",
      D: "11 × 15",
      E: "11 × 15",
      H: "11 × 15",
      M: "13 × 15",
      O: "11 × 15",
      S: "11 × 15",
      Y: "11 × 15",
    })
})

// `word` drops a letter it has no glyph for, so a missing one only shows as a shorter word.
test("ACADEMY sets every letter", () => {
  expect(
    word("ACADEMY").columns,
  )
    .toBe(6 * 11 + 13 + 6 * 3)
})

test("an override replaces the glyph for its letter alone", () => {
  expect(
    word("A", {
      A: House,
    })
      .dots,
  )
    .toEqual(House.dots)

  expect(
    word("HA", {
      A: House,
    })
      .columns,
  )
    .toBe(11 + 3 + House.columns)
})
