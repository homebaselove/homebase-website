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
    return yield* HttpServerResponse.unsafeJson(
      {
        error: payload.error?.message ?? "Base RPC returned no balance",
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
    Effect.catchAll((error) =>
      HttpServerResponse.unsafeJson(
        {
          error: `Could not read the funding balance: ${error}`,
        },
        {
          status: 502,
        },
      )
    ),
  )
