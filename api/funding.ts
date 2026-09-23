interface ServerlessResponse {
  setHeader(name: string, value: string): void
  status(code: number): ServerlessResponse
  json(body: unknown): void
}

/** Mirrors FundingAddress in src/funding.ts; a test holds the two together. */
const FundingAddressDefault = "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3"

const AddressPattern = /^0x[0-9a-fA-F]{40}$/

/**
 * Serverless counterpart of src/routes/funding.json/_server.ts. The creator
 * fees accrue inside Bankr and only reach the address when someone claims
 * them, so this reads what the position has earned rather than what the
 * address is holding.
 *
 * Keep the payload, and raisedFrom, in sync with the route and with
 * raisedFromCreatorFees in src/funding.ts. A test compares the two.
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

  const api = process.env.HOMEBASE_BANKR_API || "https://api.bankr.bot"

  try {
    const fees = await fetch(
      `${api}/public/doppler/creator-fees/${address}`,
      {
        headers: {
          accept: "application/json",
        },
      },
    )

    if (!fees.ok) {
      response
        .status(502)
        .json({
          error: `Bankr responded with ${fees.status}`,
        })

      return
    }

    const payload = await fees.json()
    const raisedEth = raisedFrom(payload)

    if (raisedEth === null) {
      // Logged rather than returned: it names the fields Bankr actually sent.
      console.error("Bankr returned no creator fees:", Object.keys(payload ?? {}))

      response
        .status(502)
        .json({
          error: "Bankr returned no creator fees",
        })

      return
    }

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600",
    )
    response.json({
      address,
      raisedEth,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    // Logged rather than returned: the error can carry the request URL.
    console.error("Could not read the funding balance:", error)

    response
      .status(502)
      .json({
        error: "Could not read the funding balance",
      })
  }
}

const toEth = (value: unknown): number | null => {
  const eth = typeof value === "string" ? Number(value) : value

  return typeof eth === "number" && Number.isFinite(eth) ? eth : null
}

/** Mirrors raisedFromCreatorFees in src/funding.ts. */
export function raisedFrom(payload: any): number | null {
  const lifetime = toEth(payload?.lifetimeEarnedWeth)

  if (lifetime !== null) {
    return lifetime
  }

  const claimed = toEth(payload?.totals?.claimedWeth)
  const claimable = toEth(payload?.totals?.claimableWeth)

  if (claimed === null && claimable === null) {
    return null
  }

  return (claimed ?? 0) + (claimable ?? 0)
}
