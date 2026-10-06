/**
 * The registry on Base: the contract in contracts/HomebaseMap.sol, which
 * holds the Luma slugs the allowed wallets have pinned. The server only
 * reads it, through a public RPC; the browser writes to it through the
 * connected wallet.
 */
import * as AbiFunction from "ox/AbiFunction"
import * as Address from "ox/Address"
import type { Hex } from "ox/Hex"
import { BaseRpcUrl } from "../../api/funding.ts"

export const BaseChainId = 8453

/** The Homebase wallet, the registry's first admin. */
export const HomebaseWallet = "0x3D140B892437dD7857701098415deB2daaE03A40"

/**
 * Where the registry lives on Base, as printed by scripts/deploy-registry.ts;
 * empty until it is deployed, when the map is read-only and says so.
 */
export const RegistryAddress = ""

export interface Registry {
  readonly chainId: number
  readonly address: string
}

export interface Pin {
  readonly slug: string
  readonly by: string
  readonly pinnedAt: bigint
}

/** Luma's slugs: the path of an event page, which the contract caps at 64 bytes. */
const Slug = /^[A-Za-z0-9_-]{1,64}$/

const AddressShape = /^0x[0-9a-fA-F]{40}$/

const list = AbiFunction.from(
  "function list() view returns ((string slug, address by, uint64 pinnedAt)[])",
)

/** The deployed registry, from the environment first so a test can point at its own chain. */
export function configured(
  env: Record<string, string | undefined>,
): Registry | null {
  const address = (env.HOMEBASE_MAP_REGISTRY ?? RegistryAddress).trim()

  return AddressShape.test(address)
    ? {
      chainId: BaseChainId,
      address,
    }
    : null
}

/** Every pin in the registry, in its order, with any slug the contract should not have let in left out. */
export async function readPins(
  ctx: {
    readonly env: Record<string, string | undefined>
    readonly fetch: typeof fetch
  },
  registry: Registry,
): Promise<Pin[]> {
  const response = await ctx.fetch(ctx.env.HOMEBASE_BASE_RPC || BaseRpcUrl, {
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
          to: registry.address,
          data: AbiFunction.encodeData(list),
        },
        "latest",
      ],
    }),
    signal: AbortSignal.timeout?.(10_000),
  })

  if (!response.ok) {
    throw new Error(`The chain answered ${response.status}`)
  }

  const answer = await response.json() as {
    result?: string
    error?: {
      message?: string
    }
  }

  if (typeof answer.result !== "string") {
    throw new Error(answer.error?.message ?? "The chain gave no answer")
  }

  const pins = AbiFunction.decodeResult(
    list,
    answer.result as Hex,
  ) as readonly {
    slug: string
    by: string
    pinnedAt: bigint
  }[]

  return pins
    .filter((pin) => Slug.test(pin.slug))
    .map((pin) => ({
      slug: pin.slug,
      by: Address.checksum(pin.by as Address.Address),
      pinnedAt: pin.pinnedAt,
    }))
}
