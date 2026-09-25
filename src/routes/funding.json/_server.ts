import { HttpServerResponse } from "@effect/platform"
import { Config, Effect } from "effect"
import {
  answerFunding,
  BankrApiUrl,
  CacheControl,
  FundingAddress,
} from "../../../api/funding.ts"

/**
 * Answers with the read the Vercel function makes, taken from its module, so
 * the two cannot drift and a process keeps a single answer for both.
 */
export const GET = Effect.gen(function*() {
  const address = yield* Config
    .string("HOMEBASE_FUNDING_ADDRESS")
    .pipe(Config.withDefault(FundingAddress))
  const api = yield* Config
    .string("HOMEBASE_BANKR_API")
    .pipe(Config.withDefault(BankrApiUrl))

  const { status, body } = yield* Effect.promise(() =>
    answerFunding(address, api)
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
  .pipe(
    // Cause rather than error, so a defect cannot escape as an unhandled
    // crash; answerFunding already turns every failed read into a 502.
    Effect.catchAllCause((cause) =>
      Effect.gen(function*() {
        yield* Effect.logError("Could not read the funding balance", cause)

        return yield* HttpServerResponse.unsafeJson(
          {
            error: "Could not read the funding balance",
          },
          {
            status: 502,
          },
        )
      })
    ),
  )
