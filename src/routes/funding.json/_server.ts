import { HttpBody, HttpClient, HttpServerResponse } from "@effect/platform"
import { Config, DateTime, Effect } from "effect"
import { weiToEth } from "../../funding.ts"

const BaseRpcDefault = "https://mainnet.base.org"

/**
 * The address collects 100% of the $home creator fees, so its balance is what
 * the funding card reads as raised.
 *
 * Keep the payload in sync with api/funding.ts.
 */
export const GET = Effect.gen(function*() {
  const address = yield* Config.string("HOMEBASE_FUNDING_ADDRESS")
  const rpcUrl = yield* Config
    .string("HOMEBASE_BASE_RPC")
    .pipe(Config.withDefault(BaseRpcDefault))

  const httpClient = yield* HttpClient.HttpClient

  const response = yield* httpClient.post(rpcUrl, {
    body: HttpBody.unsafeJson({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [
        address,
        "latest",
      ],
    }),
  })

  const payload = (yield* response.json) as {
    result?: string
    error?: {
      message?: string
    }
  }

  if (!payload.result) {
    // Logged rather than returned: a provider states its key in some auth
    // errors.
    yield* Effect.logError(
      "Base RPC returned no balance",
      payload.error?.message,
    )

    return yield* HttpServerResponse.unsafeJson(
      {
        error: "Base RPC returned no balance",
      },
      {
        status: 502,
      },
    )
  }

  const wei = BigInt(payload.result)

  return yield* HttpServerResponse.unsafeJson({
    address,
    raisedWei: wei.toString(),
    raisedEth: weiToEth(wei),
    updatedAt: DateTime.formatIso(DateTime.unsafeNow()),
  })
})
  .pipe(
    // Cause rather than error: BigInt throws on a malformed balance, and a
    // defect would otherwise escape as an unhandled crash. The detail is
    // logged rather than returned, because the RPC URL it carries may hold a
    // provider key.
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
