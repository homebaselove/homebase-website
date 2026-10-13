/// <reference lib="dom" />
/**
 * Lights the shirt. Chromium draws flat layers: the backdrop, the albedo
 * (cloth and ink, transparent around the shirt), an occlusion map, and the
 * sharp sources of the height map. The height map is put together here in
 * floating point: every smooth slope in it comes from blurring a sharp
 * shape in floats, because a slope drawn by the browser has only 256 steps,
 * and lit those steps show as contour lines. It gets a knit texture, is
 * turned into normals and lit from the top left; the cloth is shaded in
 * linear light and laid on the backdrop.
 *
 * Runs in the browser through `page.evaluate`, so it must not close over
 * anything outside itself.
 */
export async function light(args: {
  backdrop: string
  albedo: string
  masks: string
  folds: string
  details: string
  occlusion: string
  width: number
  height_: number
  /** Pixels per garment inch. */
  scale: number
  /** How strongly the shape shades the cloth, 0 to 1. */
  relief: number
  /** Linear-light white added where the cloth faces the light. */
  sheen: number
}) {
  const { width: w, height_: h, scale } = args
  const n = w * h

  const pixels = async (svg: string) => {
    const url = URL.createObjectURL(
      new Blob([svg], {
        type: "image/svg+xml",
      }),
    )
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = new OffscreenCanvas(w, h)
    const context = canvas.getContext("2d")!
    context.drawImage(image, 0, 0, w, h)
    URL.revokeObjectURL(url)

    return context.getImageData(0, 0, w, h).data
  }

  /** Gaussian blur in place, as three box blurs of running sums. */
  const blur = (data: Float32Array, sigma: number) => {
    const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1)
    let lower = Math.floor(ideal)
    if (lower % 2 === 0) lower--
    const upper = lower + 2
    const m = Math.round(
      (12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9)
        / (-4 * lower - 4),
    )
    const boxes = [0, 1, 2].map((i) => ((i < m ? lower : upper) - 1) / 2)
    const scratch = new Float32Array(n)

    const pass = (
      from: Float32Array,
      to: Float32Array,
      r: number,
      horizontal: boolean,
    ) => {
      const lines = horizontal ? h : w
      const length = horizontal ? w : h
      const stride = horizontal ? 1 : w
      const scaleBy = 1 / (r + r + 1)
      for (let line = 0; line < lines; line++) {
        const start = horizontal ? line * w : line
        const first = from[start]
        const last = from[start + (length - 1) * stride]
        let acc = (r + 1) * first
        for (let i = 0; i < r; i++) {
          acc += from[start + Math.min(i, length - 1) * stride]
        }
        for (let i = 0; i < length; i++) {
          const add = i + r < length ? from[start + (i + r) * stride] : last
          const drop = i - r - 1 >= 0
            ? from[start + (i - r - 1) * stride]
            : first
          acc += add - drop
          to[start + i * stride] = acc * scaleBy
        }
      }
    }

    for (const r of boxes) {
      if (r < 1) continue
      pass(data, scratch, r, true)
      pass(scratch, data, r, false)
    }
  }

  const [backdrop, albedo, occlusion, masks, foldMap, detailMap] = await Promise
    .all([
      pixels(args.backdrop),
      pixels(args.albedo),
      pixels(args.occlusion),
      pixels(args.masks),
      pixels(args.folds),
      pixels(args.details),
    ])

  const channel = (data: Uint8ClampedArray, c: number, center = 0) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = data[i * 4 + c] / 255 - center

    return out
  }

  // The body is a tube and the sleeves hang over it: blurring each coverage
  // mask gives a dome that turns away at its edges. The sleeve blends into
  // the body over a short slope, as the armhole seam rounds into it.
  const bodyDome = channel(masks, 0)
  blur(bodyDome, scale * 1.3)
  const sleeveDome = channel(masks, 2)
  blur(sleeveDome, scale * 0.85)
  const sleeve = channel(masks, 1)
  blur(sleeve, scale * 0.14)
  const folds = channel(foldMap, 0, 128 / 255)
  blur(folds, scale * 0.2)
  const details = channel(detailMap, 0, 128 / 255)
  blur(details, Math.max(1, scale * 0.018))

  const height = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    height[i] = (1 - sleeve[i]) * 0.26 * bodyDome[i]
      + sleeve[i] * (0.06 + 0.26 * sleeveDome[i])
      + folds[i] * 0.25
      + details[i] * 0.05
  }

  // Seeded (mulberry32), so a rebuild writes the same image.
  let seed = 0x7ee
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Jersey: fine loops in columns, so the grain runs a little longer than
  // it is wide, and shallow enough to read as cloth rather than leather.
  const knit = new Float32Array(n)
  for (let i = 0; i < n; i++) knit[i] = random() - 0.5
  const knitDepth = 0.00045 * (120 / scale)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x
      const above = y > 0 ? knit[i - w] : 0
      const below = y < h - 1 ? knit[i + w] : 0
      height[i] += (above + knit[i] * 2 + below) * 0.25 * knitDepth
    }
  }

  // Valleys gather shadow: how far each point sits below its surroundings.
  const surround = new Float32Array(height)
  blur(surround, scale * 0.5)

  const k = 10 * scale
  const lx = -0.42
  const ly = -0.58
  const lz = 0.7
  const ll = Math.hypot(lx, ly, lz)
  const Lx = lx / ll
  const Ly = ly / ll
  const Lz = lz / ll
  const hx = Lx
  const hy = Ly
  const hz = Lz + 1
  const hl = Math.hypot(hx, hy, hz)
  const Hx = hx / hl
  const Hy = hy / hl
  const Hz = hz / hl
  const ambient = 0.32
  const wrap = 0.35
  const diffuse = (d: number) =>
    ambient + (1 - ambient) * (d + wrap) / (1 + wrap)
  const flat = diffuse(Lz)
  const flatSpecular = Math.pow(Hz, 24)

  const toLinear = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const toSrgb = new Uint8ClampedArray(4096)
  for (let i = 0; i < 4096; i++) {
    const c = i / 4095
    toSrgb[i] = 255
      * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
  }
  const encode = (c: number) =>
    toSrgb[Math.max(0, Math.min(4095, (c * 4095) | 0))]

  const out = new ImageData(w, h)
  const o = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p = i * 4
      const a = albedo[p + 3] / 255
      let r = toLinear[backdrop[p]]
      let g = toLinear[backdrop[p + 1]]
      let b = toLinear[backdrop[p + 2]]

      if (a > 0) {
        const left = height[x > 0 ? i - 1 : i]
        const right = height[x < w - 1 ? i + 1 : i]
        const up = height[y > 0 ? i - w : i]
        const down = height[y < h - 1 ? i + w : i]
        let nx = -(right - left) * 0.5 * k
        let ny = -(down - up) * 0.5 * k
        let nz = 1
        const nl = Math.hypot(nx, ny, nz)
        nx /= nl
        ny /= nl
        nz /= nl

        const d = nx * Lx + ny * Ly + nz * Lz
        const shade = diffuse(d) / flat
        const cavity = Math.max(0, surround[i] - height[i])
        const occluded = (occlusion[p] / 255) * Math.max(0.35, 1 - cavity * 9)
        const f = (1 + (shade - 1) * args.relief) * occluded
        const s = Math.max(0, nx * Hx + ny * Hy + nz * Hz)
        const spec = args.sheen
          * Math.max(0, Math.pow(s, 24) - flatSpecular * 0.6)
          * occluded

        const cr = toLinear[albedo[p]] * f + spec
        const cg = toLinear[albedo[p + 1]] * f + spec
        const cb = toLinear[albedo[p + 2]] * f + spec
        r = r * (1 - a) + cr * a
        g = g * (1 - a) + cg * a
        b = b * (1 - a) + cb * a
      }

      o[p] = encode(r)
      o[p + 1] = encode(g)
      o[p + 2] = encode(b)
      o[p + 3] = 255
    }
  }

  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext("2d")!.putImageData(out, 0, 0)
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.93,
  })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return btoa(binary)
}
