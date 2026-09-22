interface ServerlessResponse {
  setHeader(name: string, value: string): void
  status(code: number): ServerlessResponse
  json(body: unknown): void
}

const BaseRpcDefault = "https://mainnet.base.org"

/** Mirrors FundingAddress in src/funding.ts; a test holds the two together. */
const FundingAddressDefault = "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3"

const AddressPattern = /^0x[0-9a-fA-F]{40}$/

/**
 * Serverless counterpart of src/routes/funding.json/_server.ts. The address
 * collects 100% of the $home creator fees, so its balance is what the funding
 * card reads as raised.
 *
 * Keep the payload in sync with src/routes/funding.json/_server.ts.
 */
export default async function handler(
  _request: unknown,
  response: ServerlessResponse,
) {
  const address = process.env.HOMEBASE_FUNDING_ADDRESS || FundingAddressDefault

  if (!AddressPattern.test(address)) {
    response
      .status(500)
      .json({
        error: "HOMEBASE_FUNDING_ADDRESS is not an address",
      })

    return
  }

  const rpcUrl = process.env.HOMEBASE_BASE_RPC || BaseRpcDefault

  try {
    const rpc = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [
          address,
          "latest",
        ],
      }),
    })

    if (!rpc.ok) {
      response
        .status(502)
        .json({
          error: `Base RPC responded with ${rpc.status}`,
        })

      return
    }

    const payload = await rpc.json() as {
      result?: string
      error?: {
        message?: string
      }
    }

    if (!payload.result) {
      // Logged rather than returned: a provider states its key in some auth
      // errors.
      console.error("Base RPC returned no balance:", payload.error?.message)

      response
        .status(502)
        .json({
          error: "Base RPC returned no balance",
        })

      return
    }

    const wei = BigInt(payload.result)
    const unit = 10n ** 18n

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    )
    response.json({
      address,
      raisedWei: wei.toString(),
      raisedEth: Number(wei / unit) + Number(wei % unit) / 1e18,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    // Logged rather than returned: the RPC URL the error carries may hold a
    // provider key.
    console.error("Could not read the funding balance:", error)

    response
      .status(502)
      .json({
        error: "Could not read the funding balance",
      })
  }
}
