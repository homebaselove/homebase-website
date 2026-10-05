import { handler } from "../src/map/vercel.ts"

/** Vercel answers /map/refresh.json with this, and its cron calls it daily. */
const refresh = handler("refresh")

export const GET = refresh

export const HEAD = refresh

export const POST = refresh
