export interface Point {
  x: number
  y: number
}

/** A cubic Bézier: start, two controls, end. */
export type Cubic = readonly [Point, Point, Point, Point]

export const pt = (x: number, y: number): Point => ({
  x,
  y,
})

export function mirror(curve: readonly Cubic[]): Cubic[] {
  return curve
    .map(([a, b, c, d]): Cubic => [
      pt(-d.x, d.y),
      pt(-c.x, c.y),
      pt(-b.x, b.y),
      pt(-a.x, a.y),
    ])
    .reverse()
}

export function reverse(curve: readonly Cubic[]): Cubic[] {
  return curve
    .map(([a, b, c, d]): Cubic => [d, c, b, a])
    .reverse()
}

function at([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t

  return pt(
    u * u * u * a.x
      + 3 * u * u * t * b.x
      + 3 * u * t * t * c.x
      + t * t * t * d.x,
    u * u * u * a.y
      + 3 * u * u * t * b.y
      + 3 * u * t * t * c.y
      + t * t * t * d.y,
  )
}

function tangent([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t
  const x = 3 * u * u * (b.x - a.x)
    + 6 * u * t * (c.x - b.x)
    + 3 * t * t * (d.x - c.x)
  const y = 3 * u * u * (b.y - a.y)
    + 6 * u * t * (c.y - b.y)
    + 3 * t * t * (d.y - c.y)
  const length = Math.hypot(x, y) || 1

  return pt(x / length, y / length)
}

/** Points along a curve, `perSegment` to each segment, with unit tangents. */
export function sample(curve: readonly Cubic[], perSegment: number) {
  const points: {
    p: Point
    t: Point
  }[] = []

  curve.forEach((segment, index) => {
    for (let i = index === 0 ? 0 : 1; i <= perSegment; i++) {
      points.push({
        p: at(segment, i / perSegment),
        t: tangent(segment, i / perSegment),
      })
    }
  })

  return points
}

/**
 * The curve moved `distance` along its left-hand normal: up for a curve
 * drawn left to right, since y grows downward.
 */
export function offset(
  curve: readonly Cubic[],
  distance: number,
  perSegment = 48,
): Point[] {
  return sample(curve, perSegment)
    .map(({ p, t }) => pt(p.x + t.y * distance, p.y - t.x * distance))
}

/** Maps inches on the garment to pixels on the canvas. */
export class Space {
  constructor(
    readonly scale: number,
    readonly originX: number,
    readonly originY: number,
  ) {}

  x(inches: number) {
    return round(this.originX + inches * this.scale)
  }

  y(inches: number) {
    return round(this.originY + inches * this.scale)
  }

  len(inches: number) {
    return round(inches * this.scale)
  }

  point(p: Point) {
    return `${this.x(p.x)} ${this.y(p.y)}`
  }

  /** Path data for joined curves; `move` starts a new subpath. */
  curve(curve: readonly Cubic[], move = true) {
    return curve
      .map(([a, b, c, d], index) =>
        `${index === 0 && move ? `M${this.point(a)}` : ""}C${this.point(b)} ${
          this.point(c)
        } ${this.point(d)}`
      )
      .join("")
  }

  polyline(points: readonly Point[], move = true) {
    return points
      .map((p, index) => `${index === 0 && move ? "M" : "L"}${this.point(p)}`)
      .join("")
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
