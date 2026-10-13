/// <reference lib="dom" />
/**
 * Lifts the SeedMe egg off its ink backdrop at print size. The source is a
 * 1200 × 800 render with film grain, so it cannot be scaled up as it is:
 * the grain would swell into blotches and the edge would stair-step. Instead
 * the outline is traced and fitted with a Fourier series, which gives a
 * smooth edge at any size; the shading is denoised without letting the
 * backdrop bleed in at the edge, scaled up, cut to the fitted outline, and
 * given fresh grain at the new size.
 *
 * Runs in the browser through `page.evaluate`, so it must not close over
 * anything outside itself.
 */
export async function liftEgg(args: {
  src: string
  width: number
}) {
  const image = new Image()
  image.src = args.src
  await image.decode()

  const w = image.width
  const h = image.height
  const source = new OffscreenCanvas(w, h)
  const sourceContext = source.getContext("2d")!
  sourceContext.drawImage(image, 0, 0)
  const px = sourceContext.getImageData(0, 0, w, h).data

  const gaussian = (input: Float32Array, sigma: number) => {
    const radius = Math.ceil(sigma * 3)
    const kernel = new Float32Array(radius * 2 + 1)
    let sum = 0
    for (let i = -radius; i <= radius; i++) {
      kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma))
      sum += kernel[i + radius]
    }
    kernel.forEach((value, i) => (kernel[i] = value / sum))

    const pass = new Float32Array(w * h)
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.min(w - 1, Math.max(0, x + k))
          acc += input[y * w + xx] * kernel[k + radius]
        }
        pass[y * w + x] = acc
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.min(h - 1, Math.max(0, y + k))
          acc += pass[yy * w + x] * kernel[k + radius]
        }
        out[y * w + x] = acc
      }
    }

    return out
  }

  const background = [px[0], px[1], px[2]]
  const distance = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    distance[i] = Math.hypot(
      px[i * 4] - background[0],
      px[i * 4 + 1] - background[1],
      px[i * 4 + 2] - background[2],
    )
  }
  const contrast = gaussian(distance, 1.5)
  const threshold = 28

  let cx = 0
  let cy = 0
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (contrast[y * w + x] > threshold) {
        cx += x
        cy += y
        count++
      }
    }
  }
  cx /= count
  cy /= count

  const sampleAt = (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return 0
    const fx = x - x0
    const fy = y - y0
    const i = y0 * w + x0

    return contrast[i] * (1 - fx) * (1 - fy)
      + contrast[i + 1] * fx * (1 - fy)
      + contrast[i + w] * (1 - fx) * fy
      + contrast[i + w + 1] * fx * fy
  }

  // The edge along each ray, found walking in from outside the egg.
  const rays = 720
  const radii = new Float64Array(rays)
  for (let k = 0; k < rays; k++) {
    const angle = (2 * Math.PI * k) / rays
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    let previous = sampleAt(cx + 400 * dx, cy + 400 * dy)
    for (let r = 400; r > 0; r -= 0.25) {
      const value = sampleAt(cx + r * dx, cy + r * dy)
      if (value >= threshold) {
        radii[k] = r + 0.25 * (value - threshold) / (value - previous || 1)
        break
      }
      previous = value
    }
  }

  const harmonics = 10
  const cosines = new Float64Array(harmonics + 1)
  const sines = new Float64Array(harmonics + 1)
  for (let n = 0; n <= harmonics; n++) {
    for (let k = 0; k < rays; k++) {
      const angle = (2 * Math.PI * k) / rays
      cosines[n] += radii[k] * Math.cos(n * angle)
      sines[n] += radii[k] * Math.sin(n * angle)
    }
    cosines[n] *= (n === 0 ? 1 : 2) / rays
    sines[n] *= 2 / rays
  }
  const radius = (angle: number) => {
    let r = 0
    for (let n = 0; n <= harmonics; n++) {
      r += cosines[n] * Math.cos(n * angle) + sines[n] * Math.sin(n * angle)
    }

    return r
  }

  // Denoise by normalised convolution over the inside only, so the dark
  // backdrop never smears into the rim.
  const weight = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - cx, y - cy)
      weight[y * w + x] = r < radius(Math.atan2(y - cy, x - cx)) - 2.5 ? 1 : 0
    }
  }
  const sigma = 2.2
  const total = gaussian(weight, sigma)
  const channels = [0, 1, 2].map((c) => {
    const weighted = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) weighted[i] = px[i * 4 + c] * weight[i]

    return gaussian(weighted, sigma)
  })

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let k = 0; k < rays; k++) {
    const angle = (2 * Math.PI * k) / rays
    const r = radius(angle)
    minX = Math.min(minX, cx + r * Math.cos(angle))
    maxX = Math.max(maxX, cx + r * Math.cos(angle))
    minY = Math.min(minY, cy + r * Math.sin(angle))
    maxY = Math.max(maxY, cy + r * Math.sin(angle))
  }
  const cropX = Math.floor(minX) - 4
  const cropY = Math.floor(minY) - 4
  const cropW = Math.ceil(maxX) + 4 - cropX
  const cropH = Math.ceil(maxY) + 4 - cropY

  const crop = new ImageData(cropW, cropH)
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const i = (y + cropY) * w + x + cropX
      const o = (y * cropW + x) * 4
      const t = total[i] || 1e-6
      crop.data[o] = channels[0][i] / t
      crop.data[o + 1] = channels[1][i] / t
      crop.data[o + 2] = channels[2][i] / t
      crop.data[o + 3] = 255
    }
  }
  const small = new OffscreenCanvas(cropW, cropH)
  small.getContext("2d")!.putImageData(crop, 0, 0)

  // Size the output to the fitted outline, not the padded crop.
  const scale = args.width / (maxX - minX)
  const outW = args.width
  const outH = Math.round((maxY - minY) * scale)
  const out = new OffscreenCanvas(outW, outH)
  const context = out.getContext("2d")!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(
    small,
    (cropX - minX) * scale,
    (cropY - minY) * scale,
    cropW * scale,
    cropH * scale,
  )

  // Grain about as coarse, for the size of the egg, as the source has.
  const grainScale = 2.5
  const grainW = Math.ceil(outW / grainScale)
  const grainH = Math.ceil(outH / grainScale)
  const grain = new ImageData(grainW, grainH)
  // Seeded (mulberry32), so a rebuild writes the same file.
  let seed = 0x5eed
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < grainW * grainH; i++) {
    const u = random() || 1e-9
    const v = random()
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    const value = Math.max(0, Math.min(255, 128 + n * 40))
    grain.data[i * 4] = value
    grain.data[i * 4 + 1] = value
    grain.data[i * 4 + 2] = value
    grain.data[i * 4 + 3] = 255
  }
  const grainSmall = new OffscreenCanvas(grainW, grainH)
  grainSmall.getContext("2d")!.putImageData(grain, 0, 0)
  const grainBig = new OffscreenCanvas(outW, outH)
  const grainContext = grainBig.getContext("2d")!
  grainContext.imageSmoothingEnabled = true
  grainContext.drawImage(grainSmall, 0, 0, outW, outH)
  const noise = grainContext.getImageData(0, 0, outW, outH).data

  const pixels = context.getImageData(0, 0, outW, outH)
  for (let i = 0; i < outW * outH; i++) {
    const o = i * 4
    const luma = 0.3 * pixels.data[o]
      + 0.59 * pixels.data[o + 1]
      + 0.11 * pixels.data[o + 2]
    // Brighter shading carries more grain in the source.
    const amount = ((noise[o] - 128) / 40) * (2 + luma / 40)
    pixels.data[o] += amount
    pixels.data[o + 1] += amount
    pixels.data[o + 2] += amount
  }
  context.putImageData(pixels, 0, 0)

  context.globalCompositeOperation = "destination-in"
  context.beginPath()
  const steps = 2880
  for (let k = 0; k <= steps; k++) {
    const angle = (2 * Math.PI * k) / steps
    const r = radius(angle)
    const x = (cx + r * Math.cos(angle) - minX) * scale
    const y = (cy + r * Math.sin(angle) - minY) * scale
    if (k === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
  context.fill()

  const blob = await out.convertToBlob({ type: "image/png" })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return {
    png: btoa(binary),
    width: outW,
    height: outH,
  }
}
