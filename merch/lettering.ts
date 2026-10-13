import type { Dot, DotMap } from "../src/ui/dots.ts"

/**
 * A solid 5×7 dot-matrix face for shirt lettering. The house is seven solid
 * dots tall, so a line of this lettering set at the house's pitch stands
 * exactly as tall as the house and shares its grid.
 */
const Glyphs: Record<string, readonly string[]> = {
  A: [
    ".XXX.",
    "X...X",
    "X...X",
    "XXXXX",
    "X...X",
    "X...X",
    "X...X",
  ],
  B: [
    "XXXX.",
    "X...X",
    "X...X",
    "XXXX.",
    "X...X",
    "X...X",
    "XXXX.",
  ],
  C: [
    ".XXX.",
    "X...X",
    "X....",
    "X....",
    "X....",
    "X...X",
    ".XXX.",
  ],
  D: [
    "XXXX.",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "XXXX.",
  ],
  E: [
    "XXXXX",
    "X....",
    "X....",
    "XXXX.",
    "X....",
    "X....",
    "XXXXX",
  ],
  H: [
    "X...X",
    "X...X",
    "X...X",
    "XXXXX",
    "X...X",
    "X...X",
    "X...X",
  ],
  I: [
    "XXX",
    ".X.",
    ".X.",
    ".X.",
    ".X.",
    ".X.",
    "XXX",
  ],
  M: [
    "X...X",
    "XX.XX",
    "X.X.X",
    "X.X.X",
    "X...X",
    "X...X",
    "X...X",
  ],
  N: [
    "X...X",
    "X...X",
    "XX..X",
    "X.X.X",
    "X..XX",
    "X...X",
    "X...X",
  ],
  O: [
    ".XXX.",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    ".XXX.",
  ],
  S: [
    ".XXXX",
    "X....",
    "X....",
    ".XXX.",
    "....X",
    "....X",
    "XXXX.",
  ],
  U: [
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    ".XXX.",
  ],
  V: [
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    ".X.X.",
    "..X..",
  ],
  "0": [
    ".XXX.",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    "X...X",
    ".XXX.",
  ],
  "2": [
    ".XXX.",
    "X...X",
    "....X",
    "...X.",
    "..X..",
    ".X...",
    "XXXXX",
  ],
  "6": [
    "..XX.",
    ".X...",
    "X....",
    "XXXX.",
    "X...X",
    "X...X",
    ".XXX.",
  ],
  " ": [
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
  ],
}

export const GlyphRows = 7

const LetterGap = 1

/** Empty rows between stacked lines. */
const LineGap = 2

export type Align = "left" | "right"

export function line(text: string): DotMap {
  const dots: Dot[] = []
  let offset = 0

  for (const char of text.toUpperCase()) {
    const glyph = Glyphs[char]
    if (glyph === undefined) {
      throw new Error(`No dot-matrix glyph for "${char}"`)
    }

    glyph.forEach((row, y) =>
      row
        .split("")
        .forEach((cell, x) => {
          if (cell === "X") {
            dots.push({
              x: x + offset,
              y,
            })
          }
        })
    )

    offset += glyph[0].length + LetterGap
  }

  return {
    columns: Math.max(0, offset - LetterGap),
    rows: GlyphRows,
    dots,
  }
}

/** Lines stacked on one grid, flush to the side the block sits on. */
export function block(lines: readonly string[], align: Align): DotMap {
  const maps = lines.map(line)
  const columns = Math.max(...maps.map((map) => map.columns))

  return {
    columns,
    rows: maps.length * GlyphRows + (maps.length - 1) * LineGap,
    dots: maps.flatMap((map, index) =>
      map.dots.map((dot) => ({
        x: align === "left" ? dot.x : dot.x + columns - map.columns,
        y: dot.y + index * (GlyphRows + LineGap),
      }))
    ),
  }
}
