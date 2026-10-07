import { handler } from "../src/live/vercel.ts"

/**
 * Vercel answers /live.json with this. The Bun route reaches the same
 * handler through src/live/bun.ts, so the two cannot drift.
 */
const live = handler("live")

export const GET = live

export const HEAD = live
