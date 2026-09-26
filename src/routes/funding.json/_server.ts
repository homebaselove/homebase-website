import { HttpServerResponse } from "@effect/platform"
import { Config, Effect } from "effect"
import {
  answerFunding,
  BaseRpcUrl,
  CacheControl,
  FundingAddress,
} from "../../../api/funding.ts"

/**
 * Answers with the read the Vercel function makes, taken from its module, so
 * the two cannot drift and a process keeps a single answer for both. An empty
 * variable falls back to the default, as it does there.
 */
export const GET = Effect.gen(function*() {
  const address = yield* Config
    .nonEmptyString("HOMEBASE_FUNDING_ADDRESS")
    .pipe(Config.withDefault(FundingAddress))
  const rpc = yield* Config
    .nonEmptyString("HOMEBASE_BASE_RPC")
    .pipe(Config.withDefault(BaseRpcUrl))

  const { status, body } = yield* Effect.promise(() =>
    answerFunding(address, rpc)
  )

  return yield* HttpServerResponse.unsafeJson(body, {
    status,
    headers: status === 200
      ? {
        "cache-control": CacheControl,
      }
      : undefined,
  })
})
