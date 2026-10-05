import { handler } from "../src/map/vercel.ts"

/** Vercel answers /auth/session.json with this. */
const session = handler("session")

export const GET = session

export const DELETE = session
