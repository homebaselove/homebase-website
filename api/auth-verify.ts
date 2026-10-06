import { handler } from "../src/map/vercel.ts"

/** Vercel answers /auth/verify.json with this. */
export const POST = handler("verify")
