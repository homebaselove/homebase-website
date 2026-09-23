import { HttpClient, HttpServerResponse } from "@effect/platform"
import { Config, DateTime, Effect } from "effect"
import {
  BankrApiUrl,
  bankrCreatorFeesUrl,
  FundingAddress,
  raisedFromCreatorFees,
} from "../../funding.ts"

/**
 * The creator fees accrue inside Bankr and only reach the address when someone
 * claims them, so the card reads what the position has earned rather than what
 * the address is holding.
 *
 * Keep the payload in sync with api/funding.ts.
 */
export const GET = Effect.gen(function*() {
  const address = yield* Config
    .string("HOMEBASE_FUNDING_ADDRESS")
    .pipe(Config.withDefault(FundingAddress))

  const api = yield* Config
    .string("HOMEBASE_BANKR_API")
    .pipe(Config.withDefault(BankrApiUrl))

  const httpClient = yield* HttpClient.HttpClient
  const response = yield* httpClient.get(bankrCreatorFeesUrl(address, api))

  if (response.status >= 400) {
    yield* Effect.logError("Bankr responded with", response.status)

    return yield* HttpServerResponse.unsafeJson(
      {
        error: `Bankr responded with ${response.status}`,
      },
      {
        status: 502,
      },
    )
  }

  const fees = (yield* response.json) as Parameters<
    typeof raisedFromCreatorFees
  >[0]

  const raisedEth = raisedFromCreatorFees(fees)

  if (raisedEth === null) {
    yield* Effect.logError(
      "Bankr returned no creator fees",
      Object.keys(fees ?? {}),
    )

    return yield* HttpServerResponse.unsafeJson(
      {
        error: "Bankr returned no creator fees",
      },
      {
        status: 502,
      },
    )
  }

  return yield* HttpServerResponse.unsafeJson({
    address,
    raisedEth,
    updatedAt: DateTime.formatIso(DateTime.unsafeNow()),
  })
})
  .pipe(
    // Cause rather than error: a defect would otherwise escape as an unhandled
    // crash. The detail is logged rather than returned, because it can carry
    // the request URL.
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
