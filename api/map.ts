import { handler } from "../src/map/vercel.ts"

/**
 * Vercel answers /map.json with this. The Bun route reaches the same handler
 * through src/map/bun.ts, so the two cannot drift.
 */
const map = handler("map")

export const GET = map

export const POST = map

export const DELETE = map
