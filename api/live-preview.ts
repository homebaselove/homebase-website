import { handler } from "../src/live/vercel.ts"

/** Vercel answers /live/preview.json with this. */
export const POST = handler("preview")
