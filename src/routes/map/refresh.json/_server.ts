import { handler } from "../../../map/bun.ts"

/** Reads Luma again for pins whose reading has aged. */
export const GET = handler("refresh")

export const POST = handler("refresh")
