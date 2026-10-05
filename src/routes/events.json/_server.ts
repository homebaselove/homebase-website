import { HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { Event } from "../../db/index.ts"

export const GET = Effect.gen(function*() {
  const events = yield* Event.list()

  return yield* HttpServerResponse.unsafeJson(events)
})
