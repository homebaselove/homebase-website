/**
 * The pins, as attestations on Base through the Ethereum Attestation Service
 * (EAS), a contract Base ships at a fixed address: each pin is one Luma slug
 * attested by a wallet the map lets in. The server reads them through EAS's
 * own indexer, the way Coinbase's OnchainKit reads identity badges, or from
 * a chain's logs for a local run; the browser writes them through the
 * connected wallet. Nothing is deployed and nothing is configured.
 *
 * Homebase Live keeps its calendars the same way, under a schema of its own,
 * through the generic reader here.
 */
import * as AbiFunction from "ox/AbiFunction"
import * as AbiParameters from "ox/AbiParameters"
import * as Address from "ox/Address"
import * as Hash from "ox/Hash"
import * as Hex from "ox/Hex"
import { BaseRpcUrl } from "../../api/funding.ts"

export const BaseChainId = 8453

/** The Homebase wallet: the one that may pin until $home lockers join. */
export const HomebaseWallet = "0x3D140B892437dD7857701098415deB2daaE03A40"

/** EAS and its schema registry: predeploys on Base, the same on every OP Stack chain. */
export const EasAddress = "0x4200000000000000000000000000000000000021"

export const SchemaRegistryAddress =
  "0x4200000000000000000000000000000000000020"

/** The schema a pin is attested under: the slug of the Luma event, nothing else. */
export const SchemaText = "string slug"

/** EAS's indexer for Base, free and keyless. */
export const IndexerUrl = "https://base.easscan.org/graphql"

const NoResolver = "0x0000000000000000000000000000000000000000"

/**
 * A schema's UID is the hash the registry computes for it,
 * keccak256(abi.encodePacked(schema, resolver, revocable)), so it is known
 * before anyone registers it.
 */
export const schemaUidOf = (schemaText: string): string =>
  Hash.keccak256(
    Hex.concat(Hex.fromString(schemaText), NoResolver, "0x01"),
  )

export const SchemaUid: string = schemaUidOf(SchemaText)

export interface Eas {
  readonly chainId: number
  readonly address: string
  readonly schemaRegistry: string
  /** The schema's UID. */
  readonly schema: string
  readonly schemaText: string
  /**
   * The RPC the page reads the chain with before and after a pin: Base's
   * public one, never a provider URL from the environment, which could
   * carry a key; a test's own chain when it reads logs instead of the indexer.
   */
  readonly rpc: string
}

export interface Config {
  readonly eas: Eas
  /** The wallets whose attestations count, checksummed. */
  readonly admins: readonly string[]
  /** The indexer to read from, or null to read the chain's logs. */
  readonly indexer: string | null
}

export interface Pin {
  /** The attestation's UID, which taking the pin off revokes. */
  readonly uid: string
  readonly slug: string
  readonly by: string
  readonly pinnedAt: bigint
}

/** An attestation by an allowed wallet, with its data decoded. */
export interface Attested<T> {
  readonly uid: string
  readonly value: T
  readonly by: string
  readonly at: bigint
}

/** Luma's slugs: the path of an event page. */
const Slug = /^[A-Za-z0-9_-]{1,64}$/

const AddressShape = /^0x[0-9a-fA-F]{40}$/

/**
 * What to read and whom to believe. The environment only overrides it for a
 * test on a chain of its own; the site carries the real values here.
 */
export function configured(
  env: Record<string, string | undefined>,
  schemaText: string = SchemaText,
): Config {
  const listed = (env.HOMEBASE_ADMIN_ADDRESSES ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => AddressShape.test(address))
    .map((address) => Address.checksum(address as Address.Address))
  const eas = env.HOMEBASE_EAS?.trim() ?? ""
  const registry = env.HOMEBASE_EAS_REGISTRY?.trim() ?? ""
  const indexer = env.HOMEBASE_EAS_INDEXER?.trim()
  const local = indexer === "logs"

  return {
    eas: {
      chainId: BaseChainId,
      address: AddressShape.test(eas) ? eas : EasAddress,
      schemaRegistry: AddressShape.test(registry)
        ? registry
        : SchemaRegistryAddress,
      schema: schemaUidOf(schemaText),
      schemaText,
      rpc: local ? env.HOMEBASE_BASE_RPC || BaseRpcUrl : BaseRpcUrl,
    },
    admins: listed.length > 0 ? listed : [
      HomebaseWallet,
    ],
    indexer: local ? null : indexer || IndexerUrl,
  }
}

const StringData = AbiParameters.from([
  "string",
])

/** The one string inside an attestation's data, or null for data that is not one. */
export function stringOf(data: string): string | null {
  try {
    const [value] = AbiParameters.decode(StringData, data as Hex.Hex)

    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

/** The slug inside an attestation's data, or null for data that is not one. */
function slugOf(data: string): string | null {
  const slug = stringOf(data)

  return slug !== null && Slug.test(slug) ? slug : null
}

type Reader = {
  readonly env: Record<string, string | undefined>
  readonly fetch: typeof fetch
}

/**
 * Every standing attestation under the configured schema by an allowed
 * wallet, oldest first, with its data decoded; one whose data does not
 * decode is left out.
 */
export async function readAttested<T>(
  ctx: Reader,
  config: Config,
  decode: (data: string) => T | null,
): Promise<Attested<T>[]> {
  return config.indexer
    ? fromIndexer(ctx, config, config.indexer, decode)
    : fromLogs(ctx, config, decode)
}

/** Every live pin by an allowed wallet, oldest first. */
export async function readPins(
  ctx: Reader,
  config: Config,
): Promise<Pin[]> {
  return (await readAttested(ctx, config, slugOf)).map((found) => ({
    uid: found.uid,
    slug: found.value,
    by: found.by,
    pinnedAt: found.at,
  }))
}

const PinsQuery = `query Pins($schema: String!, $attesters: [String!]!) {
  attestations(
    where: { schemaId: { equals: $schema }, attester: { in: $attesters }, revoked: { equals: false } }
    orderBy: { time: asc }
    take: 500
  ) {
    id
    attester
    data
    time
  }
}`

async function fromIndexer<T>(
  ctx: {
    readonly fetch: typeof fetch
  },
  config: Config,
  url: string,
  decode: (data: string) => T | null,
): Promise<Attested<T>[]> {
  const response = await ctx.fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: PinsQuery,
      variables: {
        schema: config.eas.schema,
        // The indexer keeps addresses as the chain wrote them; both spellings are asked for.
        attesters: config.admins.flatMap((admin) => [
          admin,
          admin.toLowerCase(),
        ]),
      },
    }),
    signal: AbortSignal.timeout?.(10_000),
  })

  if (!response.ok) {
    throw new Error(`The indexer answered ${response.status}`)
  }

  const answer = await response.json() as {
    data?: {
      attestations?: {
        id: string
        attester: string
        data: string
        time: number | string
      }[]
    }
    errors?: {
      message?: string
    }[]
  }
  const attestations = answer.data?.attestations

  if (!attestations) {
    throw new Error(answer.errors?.[0]?.message ?? "The indexer gave no answer")
  }

  return attestations.flatMap((attestation) => {
    const value = decode(attestation.data)

    return value === null
      ? []
      : [
        {
          uid: attestation.id,
          value,
          by: Address.checksum(attestation.attester as Address.Address),
          at: BigInt(attestation.time),
        },
      ]
  })
}

const AttestedTopic = Hash.keccak256(
  Hex.fromString("Attested(address,address,bytes32,bytes32)"),
)

const getAttestation = AbiFunction.from(
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
)

async function rpc(
  ctx: {
    readonly env: Record<string, string | undefined>
    readonly fetch: typeof fetch
  },
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await ctx.fetch(ctx.env.HOMEBASE_BASE_RPC || BaseRpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout?.(10_000),
  })

  if (!response.ok) {
    throw new Error(`The chain answered ${response.status}`)
  }

  const answer = await response.json() as {
    result?: unknown
    error?: {
      message?: string
    }
  }

  if (answer.result === undefined) {
    throw new Error(answer.error?.message ?? "The chain gave no answer")
  }

  return answer.result
}

/**
 * The pins from the chain's own logs: every Attested event under the schema
 * by an allowed wallet, each read back to see whether it still stands. Fine
 * for a chain a test runs; Base's public endpoint does not serve ranges that
 * wide, which is what the indexer is for.
 */
async function fromLogs<T>(
  ctx: Reader,
  config: Config,
  decode: (data: string) => T | null,
): Promise<Attested<T>[]> {
  const logs = await rpc(ctx, "eth_getLogs", [
    {
      address: config.eas.address,
      fromBlock: "0x0",
      toBlock: "latest",
      topics: [
        AttestedTopic,
        null,
        config.admins.map((admin) =>
          Hex.padLeft(admin.toLowerCase() as Hex.Hex, 32)
        ),
        config.eas.schema,
      ],
    },
  ]) as {
    data: string
  }[]
  const found: Attested<T>[] = []

  for (const log of logs) {
    const uid = log.data.slice(0, 66)
    const attestation = AbiFunction.decodeResult(
      getAttestation,
      await rpc(ctx, "eth_call", [
        {
          to: config.eas.address,
          data: AbiFunction.encodeData(getAttestation, [
            uid as Hex.Hex,
          ]),
        },
        "latest",
      ]) as Hex.Hex,
    ) as {
      time: bigint
      revocationTime: bigint
      attester: string
      data: string
    }
    const value = attestation.revocationTime === 0n
      ? decode(attestation.data)
      : null

    if (value !== null) {
      found.push({
        uid,
        value,
        by: Address.checksum(attestation.attester as Address.Address),
        at: attestation.time,
      })
    }
  }

  return found
}
