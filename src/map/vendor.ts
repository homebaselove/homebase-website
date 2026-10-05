/**
 * MapLibre is served as the files its package ships rather than bundled: Bun's
 * bundler does not carry a library's worker across, and MapLibre finds its
 * worker next to its own module. The version sits in the path so a browser can
 * keep the files for good.
 */
export const MapLibreVersion = "6.12.0"

export const VendorFiles = [
  "maplibre-gl.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl-worker.mjs",
  "maplibre-gl.css",
] as const

export type VendorFile = (typeof VendorFiles)[number]

/** Where the files are mounted, on both deploys. */
export const VendorMount = "/vendor"

export const VendorDir = `${VendorMount}/maplibre-gl@${MapLibreVersion}`

export const vendorPath = (file: VendorFile) => `${VendorDir}/${file}`
