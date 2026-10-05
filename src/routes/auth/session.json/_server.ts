import { handler } from "../../../map/bun.ts"

/** Who the bearer token belongs to; DELETE ends a wallet session. */
export const GET = handler("session")

export const DELETE = handler("session")
