import { describe, expect, test } from "bun:test"
import { mercatorLatitude, mercatorY, worldCamera } from "./camera.ts"

describe("mercator", () => {
  test("the equator is halfway down, and the poles are at the ends", () => {
    expect(
      mercatorY(0),
    )
      .toBe(0.5)
    expect(
      mercatorY(85.0511) < 0.001,
    )
      .toBe(true)
    expect(
      mercatorY(-85.0511) > 0.999,
    )
      .toBe(true)
  })

  test("the latitude comes back from its position", () => {
    for (
      const latitude of [
        -58,
        0,
        27.5,
        78,
      ]
    ) {
      expect(
        Math.abs(mercatorLatitude(mercatorY(latitude)) - latitude) < 1e-9,
      )
        .toBe(true)
    }
  })
})

describe("worldCamera", () => {
  test("the world fills the width: 512 pixels at zoom 0, twice that per level", () => {
    expect(
      worldCamera(512).zoom,
    )
      .toBe(0)
    expect(
      worldCamera(1024).zoom,
    )
      .toBe(1)
    expect(
      worldCamera(390).zoom,
    )
      .toBeCloseTo(-0.393, 3)
  })

  test("the centre sits on the inhabited latitudes, on the prime meridian", () => {
    const camera = worldCamera(1060)

    expect(
      camera.center[0],
    )
      .toBe(0)
    expect(
      Math.round(camera.center[1]),
    )
      .toBe(28)
  })

  test("a map with no width still gets a zoom MapLibre accepts", () => {
    expect(
      worldCamera(0).zoom,
    )
      .toBe(-2)
  })
})
