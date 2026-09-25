import * as AbiFunction from "ox/AbiFunction"
import type * as Hex from "ox/Hex"
import * as Value from "ox/Value"

interface ServerlessResponse {
  setHeader(name: string, value: string): void
  status(code: number): ServerlessResponse
  json(body: unknown): void
}

type Address = `0x${string}`

/**
 * The Bankr address holding the creator's share of $home's fees, all of it
 * pledged to Based House. HOMEBASE_FUNDING_ADDRESS overrides it.
 */
export const FundingAddress = "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3"

/** Base's public JSON-RPC endpoint. HOMEBASE_BASE_RPC overrides it. */
export const BaseRpcUrl = "https://mainnet.base.org"

/** $home's Uniswap v4 pool on Base, where it trades against WETH. */
export const HomePoolId =
  "0xcfa6173616804aa9974bf7a648149a98b5ce64251f3ed0b9852dd3dc0d8caa24"

/**
 * The Doppler hook on $home's pool, which keeps the pool's fee ledger: every
 * swap adds to the fees owed to the pool's fee beneficiaries, and a collect
 * folds them into a running total that only grows. Only the token's timelock,
 * or an authority it names, can point the pool at another hook.
 */
const FeeLedger: Address = "0x9982538F41f2ae29ddb9d3D9307010052984FDbB"

/** Makes several reads in one call, so they all come from the same block. */
const Multicall3 = "0xcA11bde05977b3631167028862bE2a173976CA11"

/**
 * stale-if-error lets the CDN keep serving the last answer for an hour when a
 * read fails, across instances, as the kept answer below does within one.
 */
export const CacheControl =
  "public, s-maxage=120, stale-while-revalidate=600, stale-if-error=3600"

const AddressPattern = /^0x[0-9a-fA-F]{40}$/

const isAddress = (value: string): value is Address =>
  AddressPattern.test(value)

const WAD = 10n ** 18n

const aggregate3 = AbiFunction.from(
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
)

const getShares = AbiFunction.from(
  "function getShares(bytes32 poolId, address beneficiary) view returns (uint256)",
)

const getCumulatedFees0 = AbiFunction.from(
  "function getCumulatedFees0(bytes32 poolId) view returns (uint256)",
)

const getHookFees = AbiFunction.from(
  "function getHookFees(bytes32 poolId) view returns (uint128 fees0, uint128 fees1, uint128 beneficiaryFees0, uint128 beneficiaryFees1, uint128 airlockOwnerFees0, uint128 airlockOwnerFees1, uint24 customFee)",
)

/** A failure whose message is safe to hand back, since it carries no URL. */
class ReadError extends Error {}

/**
 * The fees the address has earned from $home's pool, in wei of WETH, claimed
 * or not: its share of everything the ledger has taken, whether that still
 * waits for a collect or is already in the running total. A claim moves only
 * the address's own marker, so claiming never lowers this. WETH sorts first
 * in the pool, which makes its fees the 0 side.
 */
export function earnedWei(ledger: {
  shares: bigint
  cumulatedFees0: bigint
  beneficiaryFees0: bigint
}): bigint {
  return (ledger.cumulatedFees0 + ledger.beneficiaryFees0) * ledger.shares / WAD
}

/** The three ledger reads as one call. */
function ledgerCall(address: Address): Hex.Hex {
  return AbiFunction.encodeData(aggregate3, [
    [
      AbiFunction.encodeData(getShares, [HomePoolId, address]),
      AbiFunction.encodeData(getCumulatedFees0, [HomePoolId]),
      AbiFunction.encodeData(getHookFees, [HomePoolId]),
    ]
      .map((callData) => ({
        target: FeeLedger,
        allowFailure: false,
        callData,
      })),
  ])
}

/**
 * What the card counts as raised, in ETH. An address with no share of the
 * fees is misconfigured rather than owed nothing, so it gets no answer.
 */
function raisedFrom(answer: Hex.Hex): number {
  const [shares, cumulatedFees0, hookFees] = AbiFunction
    .decodeResult(aggregate3, answer)
    .map(({ returnData }) => returnData)
  const ledger = {
    shares: AbiFunction.decodeResult(getShares, shares),
    cumulatedFees0: AbiFunction.decodeResult(getCumulatedFees0, cumulatedFees0),
    beneficiaryFees0: AbiFunction.decodeResult(getHookFees, hookFees)[2],
  }

  if (ledger.shares === 0n) {
    throw new ReadError("The address holds no share of the $home fees")
  }

  return Number(Value.formatEther(earnedWei(ledger)))
}

/**
 * Reads the raised figure through a kept answer. One under freshMs old is
 * served as it is. One under keptMs old is served at once while a single
 * shared pass refreshes it, and a failed pass leaves it standing. Past that,
 * callers wait on the pass, which gives up after timeoutMs.
 *
 * Base's public endpoint is rate limited, so a process reads it at most once a
 * minute.
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

  const refresh = (
    address: Address,
    rpc: string,
    key: string,
  ): Promise<number> => {
    const running = passes.get(key)

    if (running) {
      return running
    }

    const pass = (async () => {
      const response = await fetch(rpc, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: Multicall3,
              data: ledgerCall(address),
            },
            "latest",
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        throw new ReadError(`Base RPC responded with ${response.status}`)
      }

      const { result, error } = await response.json()

      if (typeof result !== "string") {
        throw new ReadError("Base RPC refused the read", {
          cause: error,
        })
      }

      const raisedEth = raisedFrom(result as Hex.Hex)

      kept.set(key, {
        raisedEth,
        at: now(),
      })

      return raisedEth
    })()
      .finally(() => passes.delete(key))

    passes.set(key, pass)

    return pass
  }

  return async (address: Address, rpc: string): Promise<number> => {
    const key = `${rpc} ${address}`
    const last = kept.get(key)
    const age = last ? now() - last.at : Infinity

    if (last && age < freshMs) {
      return last.raisedEth
    }

    const pass = refresh(address, rpc, key)

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
  rpc: string,
): Promise<{
  status: number
  body: unknown
}> {
  if (!isAddress(address)) {
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
        raisedEth: await readRaised(address, rpc),
      },
    }
  } catch (error) {
    // Logged in full; only our own messages go back, as the rest can carry
    // the request URL.
    console.error("Could not read the funding balance:", error)

    return {
      status: 502,
      body: {
        error: error instanceof ReadError
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
    process.env.HOMEBASE_BASE_RPC || BaseRpcUrl,
  )

  if (status === 200) {
    response.setHeader("Cache-Control", CacheControl)
  }

  response
    .status(status)
    .json(body)
}
