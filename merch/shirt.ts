import {
  type Cubic,
  mirror,
  offset,
  type Point,
  pt,
  reverse,
  sample,
  Space,
} from "./geometry.ts"

/**
 * A crew-neck tee drawn ghost-mannequin style, as if worn by no one: the
 * body is a tube that turns away at the sides and the sleeves hang. Every
 * measurement is in inches on a men’s large, x from the centre line and y
 * down from the high point of the shoulder, so a print placed here lands
 * where it will on the garment.
 *
 * The shirt comes out as flat layers that `light` composes: the
 * backdrop, the albedo (cloth, ink and thread), the sources of the height
 * map that gives the cloth its shape (coverage masks, folds and details),
 * and an occlusion map for the shadow cast where cloth meets cloth.
 */

export interface Fabric {
  color: string
  /** The thread: a touch lighter than the cloth, as cotton thread reads. */
  thread: string
  /** How strongly the shape shades the cloth, 0 to 1. */
  relief: number
  /** Linear-light white where the cloth faces the light. */
  sheen: number
}

export type Side = "front" | "back"

export interface ShirtView {
  side: Side
  fabric: Fabric
  /** Print markup, drawn in canvas pixels through the `Space` it is given. */
  print: (space: Space) => string
}

export interface ShirtLayers {
  width: number
  height: number
  backdrop: string
  albedo: string
  masks: string
  folds: string
  details: string
  occlusion: string
}

/** Canvas size in inches around the garment. */
export const Canvas = {
  width: 30,
  height: 35,
  top: 3,
}

const Hps = pt(3.3, 0)

const Sp = pt(7.95, 1.7)

const Shoulder: Cubic[] = [
  [Hps, pt(4.9, 0.32), pt(6.5, 1), Sp],
]

const BodySide: Cubic[] = [
  [Sp, pt(8.55, 3.6), pt(8.25, 8.8), pt(8.02, 13)],
  [pt(8.02, 13), pt(7.82, 18.5), pt(8.1, 24), pt(8.2, 28.65)],
]

const Hem: Cubic[] = [
  [pt(8.2, 28.65), pt(5.5, 29), pt(2.7, 29.12), pt(0, 29.12)],
]

const RightHalf = [...Shoulder, ...BodySide, ...Hem]

/** Right to left along the bottom edge. */
const HemEdge = [...Hem, ...mirror(Hem)]

const Cap: Cubic[] = [
  [Sp, pt(9.65, 2.35), pt(10.75, 3.95), pt(11.15, 6.2)],
  [pt(11.15, 6.2), pt(11.55, 8.3), pt(11.95, 10.4), pt(12.3, 12.35)],
]

const SleeveHem: Cubic[] = [
  [pt(12.3, 12.35), pt(10.95, 12.95), pt(9.35, 13.4), pt(7.95, 13.6)],
]

const Underarm: Cubic[] = [
  [pt(7.95, 13.6), pt(7.8, 12.1), pt(7.75, 10.6), pt(7.82, 9.3)],
]

const Armhole: Cubic[] = [
  [pt(7.82, 9.3), pt(7.85, 6.6), pt(7.7, 3.9), Sp],
]

const SleeveOutline = [...Cap, ...SleeveHem, ...Underarm, ...Armhole]

/** The neck seam on the front, left to right. */
const FrontNeck: Cubic[] = [
  [pt(-3.3, 0), pt(-3.1, 1.75), pt(-1.75, 2.6), pt(0, 2.6)],
  [pt(0, 2.6), pt(1.75, 2.6), pt(3.1, 1.75), pt(3.3, 0)],
]

/** The top of the back collar, seen past the front. */
const BackCollarTop: Cubic[] = [
  [pt(-3.3, 0), pt(-2.2, 0.38), pt(-1.1, 0.46), pt(0, 0.46)],
  [pt(0, 0.46), pt(1.1, 0.46), pt(2.2, 0.38), pt(3.3, 0)],
]

/**
 * How far below the high point of the shoulder the back neck seam sits at
 * centre back. Printers measure back placements from this seam.
 */
export const BackCollar = 1.25

/** The neck seam on the back, left to right. */
const BackNeck: Cubic[] = [
  [pt(-3.3, 0), pt(-2.75, 0.85), pt(-1.5, BackCollar), pt(0, BackCollar)],
  [pt(0, BackCollar), pt(1.5, BackCollar), pt(2.75, 0.85), pt(3.3, 0)],
]

/** The top of the back collar, seen from behind. */
const BackTop: Cubic[] = [
  [pt(-3.3, 0), pt(-2.4, 0.32), pt(-1.2, 0.55), pt(0, 0.55)],
  [pt(0, 0.55), pt(1.2, 0.55), pt(2.4, 0.32), pt(3.3, 0)],
]

/** The front collar, seen inside past the back one. */
const FarTop: Cubic[] = [
  [pt(-3.3, 0), pt(-2.2, -0.2), pt(-1.1, -0.28), pt(0, -0.28)],
  [pt(0, -0.28), pt(1.1, -0.28), pt(2.2, -0.2), pt(3.3, 0)],
]

const RibWidth = 0.72

const BackBand = 0.66

interface Fold {
  curve: Cubic
  /** Widest point of the fold, in inches. */
  width: number
  /** How deep a valley (or, negative, how high a ridge) it is. */
  depth: number
}

const fold = (
  points: [number, number][],
  width: number,
  depth: number,
): Fold => ({
  curve: points.map(([x, y]) => pt(x, y)) as unknown as Cubic,
  width,
  depth,
})

/** Folds the cloth falls into on both sides. */
const BodyFolds: Fold[] = [
  // Drape from the underarms toward the middle, each valley with its ridge.
  fold([[7.7, 10.6], [6.6, 12.4], [5.5, 14], [4.2, 16.1]], 0.7, 0.13),
  fold([[7.9, 11.6], [6.9, 13.4], [6, 15], [5, 17]], 0.7, -0.07),
  fold([[-7.7, 10.3], [-6.5, 11.9], [-5.3, 13.4], [-3.9, 15.4]], 0.7, 0.13),
  fold([[-7.9, 11.3], [-6.9, 13], [-5.8, 14.5], [-4.6, 16.4]], 0.7, -0.07),
  fold([[8, 15.2], [6.9, 17], [5.9, 18.7], [5, 21]], 0.9, 0.08),
  fold([[-8, 16.2], [-6.9, 17.8], [-6, 19.4], [-5.2, 21.6]], 0.9, 0.08),
  // Broad, shallow falls toward the hem.
  fold([[3.4, 16], [3.8, 19.5], [3.4, 23], [3.8, 27.4]], 2, 0.022),
  fold([[-2.8, 17], [-3.2, 20.5], [-2.9, 24], [-3.3, 27.4]], 2, 0.02),
  fold([[0.3, 5], [0.6, 9.5], [0.1, 14], [0.5, 19]], 1.8, 0.025),
  // The pull of the collar and the weight off the shoulders.
  fold([[-2.6, 3.2], [-2.95, 4.4], [-2.75, 5.5], [-2, 6.5]], 0.5, 0.06),
  fold([[2.5, 3.4], [2.9, 4.6], [2.7, 5.6], [2, 6.4]], 0.5, 0.055),
  fold([[6, 1.9], [6.6, 3.2], [6.8, 4.5], [6.6, 6]], 0.6, 0.06),
  fold([[-6, 2], [-6.5, 3.3], [-6.7, 4.6], [-6.5, 6.1]], 0.6, 0.06),
]

const SleeveFolds: Fold[] = [
  fold([[8.3, 4.6], [9.4, 6.2], [10.2, 7.9], [10.7, 10]], 0.6, 0.1),
  fold([[8.6, 4], [9.9, 5.5], [10.8, 7.1], [11.3, 9.1]], 0.5, -0.05),
  fold([[8.2, 9.6], [9.3, 10.3], [10.4, 10.9], [11.6, 11.6]], 0.5, 0.08),
  fold([[-8.4, 4.4], [-9.5, 6], [-10.3, 7.7], [-10.8, 9.8]], 0.6, 0.1),
  fold([[-8.7, 3.8], [-10, 5.3], [-10.9, 6.9], [-11.4, 8.9]], 0.5, -0.05),
  fold([[-8.2, 9.3], [-9.2, 10.1], [-10.3, 10.7], [-11.5, 11.5]], 0.5, 0.08),
]

let documents = 0

export function shirtLayers(view: ShirtView, scale: number): ShirtLayers {
  const width = Canvas.width * scale
  const height = Canvas.height * scale
  const s = new Space(scale, width / 2, Canvas.top * scale)
  const { fabric, side } = view
  const prefix = `${side}${documents++}`
  const id = (name: string) => `${prefix}-${name}`

  const front = side === "front"
  const top = front ? BackCollarTop : FarTop
  const body = s.curve(RightHalf)
    + s.curve(mirror(RightHalf), false)
    + s.curve(top, false)
    + "Z"
  const sleeve = (hand: 1 | -1) =>
    s.curve(hand === 1 ? SleeveOutline : mirror(SleeveOutline)) + "Z"
  const sleeves = sleeve(1) + sleeve(-1)
  const sleeveHems = [SleeveHem, mirror(SleeveHem)]
  const opening = front
    ? s.curve(BackCollarTop) + s.curve(reverse(FrontNeck), false) + "Z"
    : s.curve(FarTop) + s.curve(reverse(BackTop), false) + "Z"
  const neckSeam = front ? FrontNeck : BackNeck
  const ribOuter = sample(neckSeam, 70).map(({ p }) => p)
  const ribInner = front
    ? offset(FrontNeck, RibWidth, 70)
    : sample(BackTop, 70).map(({ p }) => p)
  const rib = s.polyline(ribOuter)
    + s.polyline([...ribInner].reverse(), false)
    + "Z"
  const bandTop = sample(BackCollarTop, 70).map(({ p }) => p)
  const bandBottom = offset(BackCollarTop, -BackBand, 70)

  const svg = (content: string, background?: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${
      background
        ? `<rect width="${width}" height="${height}" fill="${background}"/>`
        : ""
    }${content}</svg>`

  const blur = (name: string, inches: number) =>
    `<filter id="${
      id(name)
    }" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${
      s.len(inches)
    }"/></filter>`

  const clips = `
    <clipPath id="${id("body")}"><path d="${body}"/></clipPath>
    <clipPath id="${id("sleeves")}"><path d="${sleeves}"/></clipPath>
    <clipPath id="${id("opening")}"><path d="${opening}"/></clipPath>`

  const dashed = (points: Point[], color: string, opacity: number) =>
    `<path d="${
      s.polyline(points)
    }" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${
      s.len(0.022)
    }" stroke-dasharray="${s.len(0.075)} ${s.len(0.045)}"/>`

  const line = (points: Point[], color: string, opacity: number, w: number) =>
    `<path d="${
      s.polyline(points)
    }" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${
      s.len(w)
    }"/>`

  const stitchLines = [
    ...(front
      ? [offset(FrontNeck, -0.1, 70), offset(FrontNeck, -0.21, 70)]
      : [offset(BackNeck, -0.1, 70)]),
    offset(HemEdge, -0.9, 60),
    offset(HemEdge, -0.99, 60),
  ]
  const sleeveStitchLines = sleeveHems.flatMap((hem) => [
    offset(hem, -0.84, 40),
    offset(hem, -0.94, 40),
  ])

  const backdrop = svg(`
    <defs>
      <radialGradient id="${id("backdrop")}" cx="50%" cy="40%" r="78%">
        <stop offset="0" stop-color="#f5f5f7"/>
        <stop offset="0.6" stop-color="#e8e8eb"/>
        <stop offset="1" stop-color="#d3d3d8"/>
      </radialGradient>
      ${blur("drop", 1.1)}
      ${blur("near", 0.35)}
    </defs>
    <rect width="${width}" height="${height}" fill="url(#${id("backdrop")})"/>
    <g filter="url(#${id("drop")})" opacity="0.22" transform="translate(${
    s.len(0.4)
  } ${s.len(1.1)})"><path d="${body}${sleeves}"/></g>
    <g filter="url(#${id("near")})" opacity="0.12" transform="translate(${
    s.len(0.1)
  } ${s.len(0.3)})"><path d="${body}${sleeves}"/></g>`)

  const albedo = svg(`
    <defs>
      ${clips}
      <filter id="${
    id("ink")
  }" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${
    (scale / 400).toFixed(2)
  }" result="soft"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="23" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.12 0 0 0 0.93" result="cover"/>
        <feComposite in="soft" in2="cover" operator="arithmetic" k1="1"/>
      </filter>
    </defs>
    <path d="${body}" fill="${fabric.color}"/>
    <g clip-path="url(#${id("body")})">
      <g filter="url(#${id("ink")})">${view.print(s)}</g>
      ${stitchLines.map((points) => dashed(points, fabric.thread, 1)).join("")}
    </g>
    <path d="${sleeves}" fill="${fabric.color}"/>
    <g clip-path="url(#${id("sleeves")})">
      ${
    sleeveStitchLines
      .map((points) => dashed(points, fabric.thread, 1))
      .join("")
  }
    </g>`)

  /**
   * A fold as nested lenses that swell from nothing to its width and back,
   * stacked so the valley is deepest along its spine.
   */
  const lens = (f: Fold) => {
    const points = sample([f.curve], 40)
    const last = points.length - 1
    const edge = (width: number, sign: number) =>
      points.map(({ p, t }, i) => {
        const half = (width / 2) * Math.pow(Math.sin((Math.PI * i) / last), 0.8)

        return pt(p.x + t.y * half * sign, p.y - t.x * half * sign)
      })

    return [1, 0.66, 0.33]
      .map((share) =>
        `<path d="${s.polyline(edge(f.width * share, 1))}${
          s.polyline(edge(f.width * share, -1).reverse(), false)
        }Z" fill="${f.depth > 0 ? "#000" : "#fff"}" fill-opacity="${
          ((Math.abs(f.depth) * 2) / 3).toFixed(3)
        }"/>`
      )
      .join("")
  }

  const grooves = (lines: Point[][], opacity: number) =>
    lines.map((points) => dashed(points, "#000", opacity)).join("")

  const ribGrooves = (outer: Point[], inner: Point[]) =>
    `<path d="${
      outer
        .map((p, i) => `M${s.point(p)}L${s.point(inner[i])}`)
        .join("")
    }" stroke="#000" stroke-opacity="0.3" stroke-width="${s.len(0.02)}"/>`

  const hemBand = (edge: Cubic[], depth: number) =>
    `<path d="${s.curve(edge)}${
      s.polyline([...offset(edge, -depth, 50)].reverse(), false)
    }Z" fill="#fff" fill-opacity="0.12"/>`
    + line(offset(edge, -depth, 50), "#000", 0.45, 0.05)

  /**
   * Red: the body, carried on past the hem so that only its sides and
   * shoulders turn away. Green: the sleeves exactly. Blue: the sleeves,
   * carried on past their hems for the same reason, and in over the
   * armholes, where they are sewn to the body rather than hanging free.
   */
  const armholeRun = (hand: 1 | -1) => {
    const [ap, , , sp] = Armhole[0]

    return s.polyline([
      pt(sp.x * hand, sp.y),
      pt((sp.x - 1.6) * hand, sp.y),
      pt((ap.x - 1.6) * hand, ap.y),
      pt(ap.x * hand, ap.y),
    ]) + "Z"
  }
  const sleeveRun = (hand: 1 | -1) => {
    const [outer, , , inner] = SleeveHem[0]
    const run = pt(0.35 * hand, 2.2)
    const corner = (p: Point) => pt(p.x * hand, p.y)

    return s.polyline([
      corner(outer),
      pt(corner(outer).x + run.x, outer.y + run.y),
      pt(corner(inner).x + run.x, inner.y + run.y),
      corner(inner),
    ]) + "Z"
  }
  const masks = svg(
    `<path d="${body}M${s.x(-8.2)} ${s.y(22)}H${s.x(8.2)}V${s.y(34)}H${
      s.x(-8.2)
    }Z" fill="#f00"/>`
      + `<path d="${sleeves}" fill="#0f0" style="mix-blend-mode:screen"/>`
      + `<path d="${sleeves}${sleeveRun(1)}${sleeveRun(-1)}${armholeRun(1)}${
        armholeRun(-1)
      }" fill="#00f" style="mix-blend-mode:screen"/>`,
    "#000",
  )

  /** Folds on mid-grey: valleys darker, ridges lighter. */
  const folds = svg(
    `
    <defs>${clips}</defs>
    <g clip-path="url(#${id("body")})">${BodyFolds.map(lens).join("")}</g>
    <path d="${sleeves}" fill="#808080"/>
    <g clip-path="url(#${id("sleeves")})">${
      SleeveFolds.map(lens).join("")
    }</g>`,
    "#808080",
  )

  /** Seams, hems, stitching and the rib on mid-grey: raised lighter, sunk darker. */
  const details = svg(
    `
    <defs>
      ${clips}
      ${blur("recess", 0.08)}
    </defs>
    <g clip-path="url(#${id("body")})">
      ${hemBand(HemEdge, 1.02)}
      ${grooves(stitchLines, 0.6)}
      <path d="${opening}" fill="#000" fill-opacity="0.55" filter="url(#${
      id("recess")
    })"/>
      <g clip-path="url(#${id("opening")})">
        ${
      front
        ? `<path d="${s.polyline(bandTop)}${
          s.polyline([...bandBottom].reverse(), false)
        }Z" fill="#fff" fill-opacity="0.25"/>
          ${ribGrooves(bandTop, bandBottom)}`
        : ""
    }
      </g>
      <path d="${rib}" fill="#fff" fill-opacity="0.22"/>
      ${ribGrooves(ribOuter, ribInner)}
      ${line(ribOuter, "#000", 0.5, 0.05)}
    </g>
    <path d="${sleeves}" fill="#808080"/>
    <g clip-path="url(#${id("sleeves")})">
      ${sleeveHems.map((hem) => hemBand(hem, 1)).join("")}
      ${grooves(sleeveStitchLines, 0.6)}
      ${
      [Armhole, mirror(Armhole)]
        .map((curve) =>
          line(sample([...curve], 30).map(({ p }) => p), "#000", 0.4, 0.05)
        )
        .join("")
    }
    </g>`,
    "#808080",
  )

  const shadowStroke = (
    curve: readonly Cubic[],
    opacity: number,
    w: number,
    filter: string,
    dx = 0,
    dy = 0,
  ) =>
    `<path d="${
      s.curve(curve)
    }" fill="none" stroke="#000" stroke-opacity="${opacity}" stroke-width="${
      s.len(w)
    }" filter="url(#${id(filter)})" transform="translate(${s.len(dx)} ${
      s.len(dy)
    })"/>`

  const occlusion = svg(
    `
    <defs>
      ${clips}
      ${blur("contact", 0.22)}
      ${blur("soft", 0.5)}
      ${blur("edge", 0.45)}
      ${blur("seam", 0.04)}
      <linearGradient id="${id("turn")}" gradientUnits="userSpaceOnUse" x1="${
      s.x(-8.3)
    }" x2="${s.x(8.3)}" y1="0" y2="0">
        <stop offset="0" stop-opacity="0.42"/>
        <stop offset="0.06" stop-opacity="0.22"/>
        <stop offset="0.2" stop-opacity="0.05"/>
        <stop offset="0.4" stop-opacity="0"/>
        <stop offset="0.62" stop-opacity="0"/>
        <stop offset="0.8" stop-opacity="0.07"/>
        <stop offset="0.94" stop-opacity="0.26"/>
        <stop offset="1" stop-opacity="0.46"/>
      </linearGradient>
      <linearGradient id="${
      id("fall")
    }" gradientUnits="userSpaceOnUse" x1="0" y1="${s.y(0)}" x2="0" y2="${
      s.y(29.2)
    }">
        <stop offset="0" stop-opacity="0"/>
        <stop offset="0.55" stop-opacity="0"/>
        <stop offset="1" stop-opacity="0.14"/>
      </linearGradient>
      <linearGradient id="${
      id("inside")
    }" gradientUnits="userSpaceOnUse" x1="0" y1="${s.y(0)}" x2="0" y2="${
      s.y(2.6)
    }">
        <stop offset="0" stop-opacity="0.55"/>
        <stop offset="1" stop-opacity="0.78"/>
      </linearGradient>
      ${
      ([1, -1] as const)
        .map((hand) =>
          `<linearGradient id="${
            id(`tube${hand}`)
          }" gradientUnits="userSpaceOnUse" x1="${s.x(7.85 * hand)}" y1="${
            s.y(9)
          }" x2="${s.x(12 * hand)}" y2="${s.y(8)}">
            <stop offset="0" stop-opacity="0.3"/>
            <stop offset="0.25" stop-opacity="0.08"/>
            <stop offset="0.55" stop-opacity="0"/>
            <stop offset="0.85" stop-opacity="0.12"/>
            <stop offset="1" stop-opacity="0.35"/>
          </linearGradient>`
        )
        .join("")
    }
    </defs>
    <g clip-path="url(#${id("body")})">
      <rect width="${width}" height="${height}" fill="url(#${id("turn")})"/>
      <rect width="${width}" height="${height}" fill="url(#${id("fall")})"/>
      ${shadowStroke(Underarm, 0.55, 0.7, "contact", -0.2)}
      ${shadowStroke(mirror(Underarm), 0.55, 0.7, "contact", 0.2)}
      ${shadowStroke(SleeveHem, 0.4, 0.6, "soft", -0.3, 0.35)}
      ${shadowStroke(mirror(SleeveHem), 0.4, 0.6, "soft", 0.3, 0.35)}
      <path d="${body}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="${
      s.len(0.8)
    }" filter="url(#${id("edge")})"/>
      <g clip-path="url(#${id("opening")})">
        ${
      front
        ? `<path d="${opening}" fill="#000" fill-opacity="0.22"/>
          <path d="${s.polyline(bandBottom)}L${s.x(4)} ${s.y(4)}L${s.x(-4)} ${
          s.y(4)
        }Z" fill="url(#${id("inside")})"/>`
        : `<path d="${opening}" fill="url(#${id("inside")})"/>`
    }
      </g>
      ${shadowStroke(neckSeam, 0.4, 0.09, "seam", 0, 0.05)}
    </g>
    <g clip-path="url(#${id("sleeves")})">
      <path d="${sleeve(1)}" fill="url(#${id("tube1")})"/>
      <path d="${sleeve(-1)}" fill="url(#${id("tube-1")})"/>
      <path d="${s.curve([...Cap, ...SleeveHem])}${
      s.curve(mirror([...Cap, ...SleeveHem]))
    }" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="${
      s.len(0.7)
    }" filter="url(#${id("edge")})"/>
    </g>`,
    "#fff",
  )

  return {
    width,
    height,
    backdrop,
    albedo,
    masks,
    folds,
    details,
    occlusion,
  }
}
