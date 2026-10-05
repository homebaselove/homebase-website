import { handler } from "../../../map/bun.ts"

/** Turns a signed message into a session. */
export const POST = handler("verify")
