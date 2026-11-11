export interface Dot {
  x: number
  y: number
}

export interface DotMap {
  columns: number
  rows: number
  dots: Dot[]
}

/** Distance between dot centers, in viewBox units. */
export const DotPitch = 10

export const DotRadius = 4

const LetterGap = 3

export function solid(cells: readonly string[]): DotMap {
  const dots: Dot[] = []

  cells.forEach((row, y) =>
    row
      .split("")
      .forEach((cell, x) => {
        if (cell === "X") {
          dots.push({
            x,
            y,
          })
        }
      })
  )

  return {
    columns: Math.max(...cells.map((row) => row.length)),
    rows: cells.length,
    dots,
  }
}

/**
 * Letters are drawn as solid blocks and then traced, which is what gives the
 * wordmark its hollow strokes: every stem comes out as two lines of dots.
 */
export function outlined(cells: readonly string[]): DotMap {
  const filled = (x: number, y: number) => cells[y]?.[x] === "X"
  const map = solid(cells)

  return {
    ...map,
    dots: map.dots.filter(({ x, y }) =>
      !(filled(x - 1, y)
        && filled(x + 1, y)
        && filled(x, y - 1)
        && filled(x, y + 1))
    ),
  }
}

export const House = solid([
  "...X...",
  "..XXX..",
  ".XXXXX.",
  "XXXXXXX",
  ".XXXXX.",
  ".XX.XX.",
  ".XX.XX.",
])

const Glyphs: Record<string, DotMap> = {
  A: outlined([
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
  ]),
  B: outlined([
    "XXXXXXXXXX.",
    "XXXXXXXXXX.",
    "XXXXXXXXXX.",
    "XXX....XXX.",
    "XXX....XXX.",
    "XXX....XXX.",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ]),
  C: outlined([
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ]),
  /** The right corners are cut on the diagonal the M's strokes run on, so D does not read as O. */
  D: outlined([
    "XXXXXXXXX..",
    "XXXXXXXXXX.",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXX.",
    "XXXXXXXXX..",
  ]),
  E: outlined([
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXXXXXXX...",
    "XXXXXXXX...",
    "XXXXXXXX...",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ]),
  H: outlined([
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
  ]),
  M: outlined([
    "XXX.......XXX",
    "XXXX.....XXXX",
    "XXXXX...XXXXX",
    "XXXXXX.XXXXXX",
    "XXXXXXXXXXXXX",
    "XXX.XXXXX.XXX",
    "XXX..XXX..XXX",
    "XXX...X...XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
    "XXX.......XXX",
  ]),
  O: outlined([
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ]),
  S: outlined([
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXX........",
    "XXX........",
    "XXX........",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "........XXX",
    "........XXX",
    "........XXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ]),
  /** The arms meet on the M's diagonal, where a squared Y read as a U on a stem. */
  Y: outlined([
    "XXX.....XXX",
    "XXX.....XXX",
    "XXX.....XXX",
    "XXXX...XXXX",
    ".XXXX.XXXX.",
    "..XXXXXXX..",
    "...XXXXX...",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
    "....XXX....",
  ]),
}

/** `overrides` swaps in other glyphs by letter, as the Academy concepts swap in their own A. */
export function word(
  text: string,
  overrides: Readonly<Record<string, DotMap>> = {},
): DotMap {
  const glyphs = text
    .split("")
    .map((char) => overrides[char] ?? Glyphs[char])
    .filter((glyph) => glyph !== undefined)

  let offset = 0
  const dots: Dot[] = []

  for (const glyph of glyphs) {
    for (const dot of glyph.dots) {
      dots.push({
        x: dot.x + offset,
        y: dot.y,
      })
    }

    offset += glyph.columns + LetterGap
  }

  return {
    columns: Math.max(0, offset - LetterGap),
    rows: Math.max(...glyphs.map((glyph) => glyph.rows)),
    dots,
  }
}
