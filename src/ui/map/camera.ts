/**
 * The overview camera. MapLibre draws the world 512 pixels wide at zoom zero
 * and twice as wide with every zoom level, so the zoom that lays the whole
 * world across a map follows from the map's width alone. The world is centred
 * on the inhabited latitudes, between the top of Greenland and the Antarctic
 * coast, so a wide map crops the poles rather than the people.
 */

const WorldWidthAtZoomZero = 512

/** The lowest zoom MapLibre accepts. */
const FloorZoom = -2

/** The latitudes the overview is centred between. */
export const WorldLatitudes = {
  north: 78,
  south: -58,
} as const

export interface Camera {
  readonly center: [number, number]
  readonly zoom: number
}

/** Where a latitude falls down the Mercator world, from 0 at the top to 1 at the bottom. */
export const mercatorY = (latitude: number): number =>
  0.5
  - Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / (2 * Math
      .PI)

/** The latitude at a position down the Mercator world. */
export const mercatorLatitude = (y: number): number =>
  (Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) * 360) / Math.PI - 90

/** The camera that shows the whole world across a map of the given width. */
export function worldCamera(width: number): Camera {
  const middle =
    (mercatorY(WorldLatitudes.north) + mercatorY(WorldLatitudes.south)) / 2

  return {
    center: [
      0,
      mercatorLatitude(middle),
    ],
    zoom: Math.max(
      FloorZoom,
      Math.log2(Math.max(width, 1) / WorldWidthAtZoomZero),
    ),
  }
}
