import { handler } from "../src/map/vercel.ts"

/** Vercel answers /auth/nonce.json with this. */
export const POST = handler("nonce")
