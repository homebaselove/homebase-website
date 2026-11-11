import * as NFs from "node:fs/promises"
import * as NPath from "node:path"
import {
  type Dot,
  type DotMap,
  DotPitch,
  DotRadius,
  House,
  outlined,
  solid,
  word,
} from "../src/ui/dots.ts"

/**
 * Writes the Homebase Academy logo concepts into `academy/concepts/` as SVG.
 * Every dot comes from the maps the site draws the Homebase logo from, and
 * the lockups are set by the kit's own measures (`scripts/brand-kit.ts`), so
 * each concept stands beside the Homebase logo as the kit draws it.
 * `academy/README.md` says what each concept is.
 *
 *   bun scripts/academy-logos.ts
 */
const OutDir = NPath.join(import.meta.dir, "..", "academy", "concepts")

const Blue = "#0000FF"
const White = "#FFFFFF"

/** The construction slide's grid grey, for the cells a letter leaves empty. */
const GridGrey = "#D4D4E0"

const Margin = DotPitch / 2 - DotRadius

/** The kit's stacked lockup: the mark at 3.3 × the letters, 77 units above them. */
const StackedScale = 3.3
const StackedGap = 77

/** The kit's horizontal lockup sets the house 60 units from the H. */
const HorizontalGap = 60

/** HOMEBASE over ACADEMY, as far apart as the house stands from the H. */
const LineGap = 6

/**
 * A ring stands in for a dot not yet filled in: its outer edge falls where
 * the dot's would, so a grid of rings and dots keeps one pitch.
 */
const RingStroke = 1.4

interface Circle {
  cx: number
  cy: number
  r: number
  stroke?: number
  fill?: string
}

interface Art {
  width: number
  height: number
  circles: Circle[]
  markup?: (fill: string, id: string) => string
}

/** A mark at the letters' scale: layers of dots, or of rings where `stroke` is set. */
interface Mark {
  columns: number
  rows: number
  layers: {
    map: DotMap
    stroke?: number
  }[]
}

const same = (a: Dot) => (b: Dot) => a.x === b.x && a.y === b.y

function without(map: DotMap, dots: readonly Dot[]): DotMap {
  return {
    ...map,
    dots: map.dots.filter((dot) => !dots.some(same(dot))),
  }
}

function cellsOf(map: DotMap): string[] {
  return Array.from(
    { length: map.rows },
    (_, y) =>
      Array
        .from(
          { length: map.columns },
          (_, x) => map.dots.some(same({ x, y })) ? "X" : ".",
        )
        .join(""),
  )
}

function enlarge(cells: readonly string[], by: number): string[] {
  return cells.flatMap((row) =>
    Array<string>(by).fill(
      row
        .split("")
        .map((cell) => cell.repeat(by))
        .join(""),
    )
  )
}

/**
 * 01 Straight A. The house gives up two dots, the middle of its roof and the
 * one over its door, and reads as an A: the roof gains a counter and the door
 * rises into the gap between two legs.
 */
const AHouse = solid([
  "...X...",
  "..XXX..",
  ".XX.XX.",
  "XXXXXXX",
  ".XX.XX.",
  ".XX.XX.",
  ".XX.XX.",
])

/**
 * The same A at the letters' size, for the Academy's own wordmark: a peaked
 * roof over the counter, and a crossbar that overhangs the legs by a cell, as
 * the house's eaves overhang its walls. Thirteen cells wide like the M, so the
 * peak has a middle column to stand on.
 */
const PeakA = outlined([
  "......X......",
  ".....XXX.....",
  "....XXXXX....",
  "...XXXXXXX...",
  "..XXXX.XXXX..",
  ".XXXX...XXXX.",
  "XXXXXXXXXXXXX",
  "XXXXXXXXXXXXX",
  "XXXXXXXXXXXXX",
  ".XXX.....XXX.",
  ".XXX.....XXX.",
  ".XXX.....XXX.",
  ".XXX.....XXX.",
  ".XXX.....XXX.",
  ".XXX.....XXX.",
])

/**
 * 02 Fill in the dots. The house's 7 × 7 grid as an answer sheet: rings where
 * the house leaves cells empty, the house filled in. A course fills the house
 * in from the ground: row by row from the bottom, each row from the middle out,
 * so the last dot placed is the peak.
 */
const Grid = solid(Array<string>(House.rows).fill("X".repeat(House.columns)))
const Middle = (House.columns - 1) / 2
const BuildOrder = [...House.dots].sort((a, b) =>
  b.y - a.y || Math.abs(a.x - Middle) - Math.abs(b.x - Middle) || a.x - b.x
)

function filledIn(count: number): Mark {
  const done = BuildOrder.slice(0, count)
  return {
    columns: Grid.columns,
    rows: Grid.rows,
    layers: [
      {
        map: without(Grid, done),
        stroke: RingStroke,
      },
      {
        map: {
          ...Grid,
          dots: done,
        },
      },
    ],
  }
}

/**
 * 03 Blueprint. The house traced, as the kit traces its letters: every cell
 * five cells wide, drawn as its outline in the letters' own dots. Homebase is
 * the house; the Academy is its plan. Below 64 px the two-cell trace stands in.
 */
const Blueprint = outlined(enlarge(cellsOf(House), 5))
const BlueprintSmall = outlined(enlarge(cellsOf(House), 2))

const Homebase = word("HOMEBASE")
const Academy = word("ACADEMY")
const AcademyPeaked = word("ACADEMY", {
  A: PeakA,
})

const BlockRows = Homebase.rows * 2 + LineGap

const mark = (map: DotMap): Mark => ({
  columns: map.columns,
  rows: map.rows,
  layers: [
    {
      map,
    },
  ],
})

function place(
  map: DotMap,
  scale: number,
  dx: number,
  dy: number,
  stroke?: number,
): Circle[] {
  return map.dots.map((dot) => ({
    cx: dx + (dot.x * DotPitch + DotPitch / 2) * scale,
    cy: dy + (dot.y * DotPitch + DotPitch / 2) * scale,
    r: DotRadius * scale - (stroke === undefined ? 0 : stroke * scale / 2),
    stroke: stroke === undefined ? undefined : stroke * scale,
  }))
}

function draw(art: Mark, scale: number, dx: number, dy: number): Circle[] {
  return art.layers.flatMap((layer) =>
    place(layer.map, scale, dx, dy, layer.stroke)
  )
}

const reach = (c: Circle) => c.r + (c.stroke ?? 0) / 2

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

/** Crops to the ink, keeping the breathing room the site's viewBox gives the dots. */
function fit(
  all: Circle[],
  markup?: (fill: string, id: string) => string,
): Art {
  const minX = Math.min(...all.map((c) => c.cx - reach(c))) - Margin
  const minY = Math.min(...all.map((c) => c.cy - reach(c))) - Margin
  const maxX = Math.max(...all.map((c) => c.cx + reach(c))) + Margin
  const maxY = Math.max(...all.map((c) => c.cy + reach(c))) + Margin

  return {
    width: round(maxX - minX),
    height: round(maxY - minY),
    circles: all.map((c) => ({
      ...c,
      cx: round(c.cx - minX),
      cy: round(c.cy - minY),
      r: round(c.r),
      stroke: c.stroke === undefined ? undefined : round(c.stroke),
    })),
    markup: markup
      && ((fill, id) =>
        `<g transform="translate(${round(-minX)} ${round(-minY)})">${
          markup(fill, id)
        }</g>`),
  }
}

/** HOMEBASE over ACADEMY, flush left beside a mark or centred under one. */
function block(
  dx: number,
  dy: number,
  academy: DotMap,
  centred: boolean,
): Circle[] {
  const indent = centred
    ? (Homebase.columns - academy.columns) / 2 * DotPitch
    : 0

  return [
    ...place(Homebase, 1, dx, dy),
    ...place(
      academy,
      1,
      dx + indent,
      dy + (Homebase.rows + LineGap) * DotPitch,
    ),
  ]
}

/**
 * The mark as tall as both lines, as the kit stands the house as tall as the
 * letters; `scale` sets it otherwise, centred on them.
 */
function horizontal(art: Mark, academy: DotMap, scale?: number): Art {
  const fitted = (BlockRows * DotPitch - 2 * Margin)
    / (art.rows * DotPitch - 2 * Margin)
  const s = scale ?? fitted
  const dots = draw(art, s, 0, (BlockRows - art.rows * s) * DotPitch / 2)
  const right = Math.max(...dots.map((c) => c.cx + reach(c)))

  return fit([
    ...dots,
    ...block(right + HorizontalGap - Margin, 0, academy, false),
  ])
}

function stacked(art: Mark, academy: DotMap, scale: number): Art {
  const dots = draw(
    art,
    scale,
    (Homebase.columns - art.columns * scale) * DotPitch / 2,
    0,
  )
  const bottom = Math.max(...dots.map((c) => c.cy + reach(c)))

  return fit([
    ...dots,
    ...block(0, bottom + StackedGap - Margin, academy, true),
  ])
}

function alone(art: Mark): Art {
  return fit(draw(art, 1, 0, 0))
}

/**
 * 04 Seal. One ring of the wordmark's dots, as near the grid's pitch as a
 * whole number of them allows; the name over the house and the year under it
 * in Lato 900, a dot at either end of the name; the house at 3.3 times the
 * ring's dots, as the kit's stacked logo stands it over the letters.
 */
const Seal = {
  ring: 232,
  text: 199,
  size: 30,
  /** 0.3 em: seals are lettered wide. */
  tracking: 9,
  /** Lato's cap height, 1433 of its 2000 units. */
  capHeight: 1433 / 2000,
  house: StackedScale,
  top: "HOMEBASE ACADEMY",
  /** The year the Academy opens. */
  bottom: "EST. 2026",
}

/**
 * The seal without its lettering, for icons and for lockups beside the
 * wordmark, where the name is already written: the ring drawn tighter round
 * the house, in dots twice the size, so it still reads as a ring at 32 px.
 */
const RingedHouse = {
  ring: 176,
  dot: 2,
}

const SealReach = Seal.ring + DotRadius
const RingedReach = RingedHouse.ring + DotRadius * RingedHouse.dot

function ring(
  cx: number,
  cy: number,
  radius: number,
  dot: number,
  scale: number,
): Circle[] {
  const count = Math.round(2 * Math.PI * radius / (DotPitch * dot))

  return Array.from({ length: count }, (_, i) => {
    const angle = i / count * 2 * Math.PI - Math.PI / 2
    return {
      cx: cx + radius * scale * Math.cos(angle),
      cy: cy + radius * scale * Math.sin(angle),
      r: DotRadius * dot * scale,
    }
  })
}

function houseAt(cx: number, cy: number, scale: number): Circle[] {
  return place(
    House,
    scale,
    cx - House.columns * DotPitch * scale / 2,
    cy - House.rows * DotPitch * scale / 2,
  )
}

/**
 * The lettering sits on two arcs a cap height apart, so that the top line,
 * which stands on its arc, and the bottom line, which hangs from it, fill the
 * same band and both read left to right. Tracking follows every letter, the
 * last included, so each line is moved on by half of it to sit centred.
 */
function seal(cx: number, cy: number, scale: number) {
  const half = Seal.size * Seal.capHeight / 2
  const top = round((Seal.text - half) * scale)
  const bottom = round((Seal.text + half) * scale)
  const centre = (radius: number) =>
    round(Math.PI * radius / 2 + Seal.tracking * scale / 2)
  const circles = [
    ...ring(cx, cy, Seal.ring, 1, scale),
    ...[-1, 1].map((side) => ({
      cx: cx + side * Seal.text * scale,
      cy,
      r: DotRadius * scale,
    })),
    ...houseAt(cx, cy, Seal.house * scale),
  ]
  // Each file names its arcs after itself, so two seals inlined in one page keep their own.
  const markup = (fill: string, id: string) =>
    [
      `<defs>`,
      `<path id="${id}-top" d="M${round(cx - top)} ${
        round(cy)
      }A${top} ${top} 0 0 1 ${round(cx + top)} ${round(cy)}"/>`,
      `<path id="${id}-bottom" d="M${round(cx - bottom)} ${
        round(cy)
      }A${bottom} ${bottom} 0 0 0 ${round(cx + bottom)} ${round(cy)}"/>`,
      `</defs>`,
      `<g fill="${fill}" font-family="Lato, sans-serif" font-weight="900" font-size="${
        round(Seal.size * scale)
      }" letter-spacing="${
        round(Seal.tracking * scale)
      }" text-anchor="middle">`,
      `<text><textPath href="#${id}-top" startOffset="${
        centre(top)
      }">${Seal.top}</textPath></text>`,
      `<text><textPath href="#${id}-bottom" startOffset="${
        centre(bottom)
      }">${Seal.bottom}</textPath></text>`,
      `</g>`,
    ]
      .join("")

  return {
    circles,
    markup,
  }
}

function ringedHouse(cx: number, cy: number, scale: number): Circle[] {
  return [
    ...ring(cx, cy, RingedHouse.ring, RingedHouse.dot, scale),
    ...houseAt(cx, cy, Seal.house * scale),
  ]
}

function sealAlone(): Art {
  const { circles, markup } = seal(SealReach, SealReach, 1)
  return fit(circles, markup)
}

function ringedAlone(): Art {
  return fit(ringedHouse(RingedReach, RingedReach, 1))
}

/** The ringed house as tall as both lines, where the kit stands its house. */
function sealHorizontal(): Art {
  const scale = (BlockRows * DotPitch - 2 * Margin) / (2 * RingedReach)

  return fit([
    ...ringedHouse(
      RingedReach * scale + Margin,
      BlockRows * DotPitch / 2,
      scale,
    ),
    ...block(
      2 * RingedReach * scale + Margin + HorizontalGap - Margin,
      0,
      Academy,
      false,
    ),
  ])
}

/** The ringed house at its own size: its house 3.3 times the letters' dots. */
function sealStacked(): Art {
  return fit([
    ...ringedHouse(Homebase.columns * DotPitch / 2, RingedReach, 1),
    ...block(0, 2 * RingedReach + StackedGap - Margin, Academy, true),
  ])
}

/** The house, then the A it becomes, the two dots it gives up left as rings. */
function straightAIdea(): Art {
  const dx = (House.columns + 4) * DotPitch

  return fit([
    ...place(House, 1, 0, 0),
    ...place(AHouse, 1, dx, 0),
    ...place(without(House, AHouse.dots), 1, dx, 0, RingStroke),
  ])
}

/** The house as built, at the trace's size, beside its trace. */
function blueprintIdea(): Art {
  const scale = Blueprint.rows / House.rows

  return fit([
    ...place(House, scale, 0, 0),
    ...place(Blueprint, 1, House.columns * DotPitch * scale + HorizontalGap, 0),
  ])
}

/** The new letters and the Academy's A on the grid they are drawn to, every cell a pinpoint. */
function letters(): Art {
  const glyphs = [word("C"), word("D"), word("Y"), PeakA]
  const gap = 6
  let offset = 0
  const all: Circle[] = []

  for (const glyph of glyphs) {
    for (let y = 0; y < glyph.rows; y++) {
      for (let x = 0; x < glyph.columns; x++) {
        if (!glyph.dots.some(same({ x, y }))) {
          all.push({
            cx: (offset + x) * DotPitch + DotPitch / 2,
            cy: y * DotPitch + DotPitch / 2,
            r: 1,
            fill: GridGrey,
          })
        }
      }
    }
    all.push(...place(glyph, 1, offset * DotPitch, 0))
    offset += glyph.columns + gap
  }

  return fit(all)
}

function svg(art: Art, fill: string, id: string) {
  const circle = (c: Circle) =>
    `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"${
      c.stroke === undefined ? "" : ` stroke-width="${c.stroke}"`
    }/>`
  const grid = art.circles.filter((c) => c.fill !== undefined)
  const dots = art.circles.filter((c) =>
    c.fill === undefined && c.stroke === undefined
  )
  const rings = art.circles.filter((c) => c.stroke !== undefined)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.width} ${art.height}" width="${art.width}" height="${art.height}">`,
    `<title>Homebase Academy</title>`,
    grid.length > 0
      ? `<g fill="${GridGrey}">${grid.map(circle).join("")}</g>`
      : "",
    `<g fill="${fill}">${dots.map(circle).join("")}</g>`,
    rings.length > 0
      ? `<g fill="none" stroke="${fill}">${rings.map(circle).join("")}</g>`
      : "",
    art.markup ? art.markup(fill, id) : "",
    `</svg>`,
  ]
    .join("") + "\n"
}

const StraightA = mark(AHouse)
const FillIn = filledIn(House.dots.length)

const Files: Record<string, [Art, string]> = {
  "straight-a-mark-blue": [alone(StraightA), Blue],
  "straight-a-mark-white": [alone(StraightA), White],
  "straight-a-horizontal-blue": [horizontal(StraightA, AcademyPeaked), Blue],
  "straight-a-stacked-white": [
    stacked(StraightA, AcademyPeaked, StackedScale),
    White,
  ],
  "straight-a-idea": [straightAIdea(), Blue],
  "fill-in-mark-blue": [alone(FillIn), Blue],
  "fill-in-mark-white": [alone(FillIn), White],
  "fill-in-small-blue": [alone(mark(House)), Blue],
  "fill-in-small-white": [alone(mark(House)), White],
  "fill-in-horizontal-blue": [horizontal(FillIn, Academy), Blue],
  "fill-in-stacked-white": [stacked(FillIn, Academy, StackedScale), White],
  "fill-in-step-0": [alone(filledIn(0)), Blue],
  "fill-in-step-13": [alone(filledIn(13)), Blue],
  "fill-in-step-28": [alone(filledIn(28)), Blue],
  "blueprint-mark-blue": [alone(mark(Blueprint)), Blue],
  "blueprint-mark-white": [alone(mark(Blueprint)), White],
  "blueprint-small-blue": [alone(mark(BlueprintSmall)), Blue],
  "blueprint-small-white": [alone(mark(BlueprintSmall)), White],
  "blueprint-horizontal-blue": [horizontal(mark(Blueprint), Academy, 1), Blue],
  "blueprint-stacked-white": [stacked(mark(Blueprint), Academy, 1), White],
  "blueprint-idea": [blueprintIdea(), Blue],
  "seal-blue": [sealAlone(), Blue],
  "seal-white": [sealAlone(), White],
  "seal-small-blue": [ringedAlone(), Blue],
  "seal-small-white": [ringedAlone(), White],
  "seal-horizontal-blue": [sealHorizontal(), Blue],
  "seal-stacked-white": [sealStacked(), White],
  "academy-wordmark-blue": [alone(mark(Academy)), Blue],
  "academy-wordmark-peaked-blue": [alone(mark(AcademyPeaked)), Blue],
  "academy-letters": [letters(), Blue],
}

await NFs.rm(OutDir, {
  recursive: true,
  force: true,
})
await NFs.mkdir(OutDir, {
  recursive: true,
})

for (const [name, [art, fill]] of Object.entries(Files)) {
  await NFs.writeFile(NPath.join(OutDir, `${name}.svg`), svg(art, fill, name))
}

console.log(
  `Wrote ${Object.keys(Files).length} files to ${
    NPath.relative(process.cwd(), OutDir)
  }`,
)
