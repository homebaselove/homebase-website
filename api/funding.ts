interface ServerlessResponse {
  setHeader(name: string, value: string): void
  status(code: number): ServerlessResponse
  json(body: unknown): void
}

/**
 * The Bankr address collecting 100% of the $home creator fees.
 * HOMEBASE_FUNDING_ADDRESS overrides it.
 */
export const FundingAddress = "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3"

/** Bankr's public read API. Its creator-fee reads need no key. */
export const BankrApiUrl = "https://api.bankr.bot"

/**
 * stale-if-error lets the CDN keep serving the last answer for an hour when a
 * read fails, across instances, as the kept answer below does within one.
 */
export const CacheControl =
  "public, s-maxage=120, stale-while-revalidate=600, stale-if-error=3600"

const AddressPattern = /^0x[0-9a-fA-F]{40}$/

/** Every position the address earns fees from. */
export const creatorFeesUrl = (address: string, api = BankrApiUrl) =>
  `${api}/public/doppler/creator-fees/${address}`

/** A failure whose message is safe to hand back, since it carries no URL. */
class BankrError extends Error {}

/** Fees are never negative, and a blank field is missing rather than zero. */
const toEth = (value: unknown): number | null => {
  const eth = typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : value

  return typeof eth === "number" && Number.isFinite(eth) && eth >= 0
    ? eth
    : null
}

/**
 * What the card counts as raised: Bankr's lifetime total of the WETH the
 * address has earned, claimed or not. The fees sit inside Bankr until someone
 * claims them, so the address's balance counts only what has been withdrawn.
 *
 * Bankr reports WETH in whole units rather than wei. Its claimed total only
 * counts claims within the requested window of days, so claimed plus
 * claimable is no stand-in: without the lifetime total there is no answer
 * rather than a smaller number.
 */
export function raisedFrom(payload: any): number | null {
  return toEth(payload?.lifetimeEarnedWeth)
}

/**
 * Reads the raised figure through a kept answer. One under freshMs old is
 * served as it is. One under keptMs old is served at once while a single
 * shared pass refreshes it, and a failed pass leaves it standing. Past that,
 * callers wait on the pass, which gives up after timeoutMs.
 *
 * Bankr asks for no more than one poll per token every 30 seconds.
 */
export function createRaisedReader(
  {
    now = Date.now,
    freshMs = 60_000,
    keptMs = 60 * 60_000,
    timeoutMs = 5_000,
  } = {},
) {
  const kept = new Map<
    string,
    {
      raisedEth: number
      at: number
    }
  >()
  const passes = new Map<string, Promise<number>>()

  const refresh = (url: string): Promise<number> => {
    const running = passes.get(url)

    if (running) {
      return running
    }

    const pass = (async () => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        throw new BankrError(`Bankr responded with ${response.status}`)
      }

      const raisedEth = raisedFrom(await response.json())

      if (raisedEth === null) {
        throw new BankrError("Bankr returned no creator fees")
      }

      kept.set(url, {
        raisedEth,
        at: now(),
      })

      return raisedEth
    })()
      .finally(() => passes.delete(url))

    passes.set(url, pass)

    return pass
  }

  return async (url: string): Promise<number> => {
    const last = kept.get(url)
    const age = last ? now() - last.at : Infinity

    if (last && age < freshMs) {
      return last.raisedEth
    }

    const pass = refresh(url)

    if (last && age < keptMs) {
      pass.catch((error) =>
        console.error("Could not refresh the funding balance:", error)
      )

      return last.raisedEth
    }

    return pass
  }
}

/** Shared by the Vercel function and the Bun route: one answer per process. */
const readRaised = createRaisedReader()

/** The answer both runtimes give for /funding.json. */
export async function answerFunding(
  address: string,
  api: string,
): Promise<{
  status: number
  body: unknown
}> {
  if (!AddressPattern.test(address)) {
    return {
      status: 500,
      body: {
        error: "HOMEBASE_FUNDING_ADDRESS is not an address",
      },
    }
  }

  try {
    return {
      status: 200,
      body: {
        address,
        raisedEth: await readRaised(creatorFeesUrl(address, api)),
      },
    }
  } catch (error) {
    // Logged in full; only our own messages go back, as the rest can carry
    // the request URL.
    console.error("Could not read the funding balance:", error)

    return {
      status: 502,
      body: {
        error: error instanceof BankrError
          ? error.message
          : "Could not read the funding balance",
      },
    }
  }
}

/**
 * Vercel serves the static client and answers /funding.json with this. The
 * Bun route imports the same read from here rather than keeping its own.
 */
export default async function handler(
  _request: unknown,
  response: ServerlessResponse,
) {
  const { status, body } = await answerFunding(
    process.env.HOMEBASE_FUNDING_ADDRESS || FundingAddress,
    process.env.HOMEBASE_BANKR_API || BankrApiUrl,
  )

  if (status === 200) {
    response.setHeader("Cache-Control", CacheControl)
  }

  response
    .status(status)
    .json(body)
}
