/**
 * Who may pin events: the wallets on the admin list, signed in with Ethereum.
 * The sign-in is the road to the next step: once SeedMe's lock contract is
 * configured, a wallet with enough $home locked signs in the same way and
 * gets the locker role.
 *
 * Signatures are checked for plain wallets by recovery and for smart wallets
 * (Base Account, Safe) through ERC-6492's universal validator, which handles
 * ERC-1271 and wallets not yet deployed in one deployless call on Base.
 */
import * as NCrypto from "node:crypto"
import * as AbiConstructor from "ox/AbiConstructor"
import * as AbiFunction from "ox/AbiFunction"
import * as Address from "ox/Address"
import { WrappedSignature } from "ox/erc6492"
import * as Hex from "ox/Hex"
import * as PersonalMessage from "ox/PersonalMessage"
import * as Secp256k1 from "ox/Secp256k1"
import * as Signature from "ox/Signature"
import * as Siwe from "ox/Siwe"
import { BaseRpcUrl } from "../../api/funding.ts"
import * as Repo from "./store.ts"
import type { Store } from "./store.ts"

const BaseChainId = 8453

/** What the wallet is asked to sign. */
const Statement = "Sign in to Homebase to add events to the map."

const NonceTtlMs = 10 * 60_000

const AdminSessionMs = 24 * 60 * 60_000

const LockerSessionMs = 60 * 60_000

export type Role =
  | "admin"
  | "locker"

export interface Actor {
  readonly role: Role
  readonly address: string
  readonly expiresAt: string
}

export interface LockConfig {
  readonly contract: string
  readonly read: AbiFunction.AbiFunction
  readonly amountIndex: number
  readonly endIndex: number | null
  readonly min: bigint
}

export interface AuthConfig {
  readonly adminAddresses: readonly string[]
  readonly lock: LockConfig | null
  readonly rpc: string
  readonly cronSecret: string | null
  /**
   * The hostnames the site is served on, which sign-in messages are bound to.
   * A request from any other host gets no message, so a page elsewhere cannot
   * have the server write one in its own name.
   */
  readonly siteHosts: ReadonlySet<string>
}

/** A hostname as a browser sends it: lower case, no scheme, no path, a port kept. */
const hostOf = (value: string): string | null => {
  const host =
    value.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]

  return host && /^[a-z0-9.\-\[\]:]+$/.test(host) ? host : null
}

const LocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export const isLocalHost = (host: string): boolean => LocalHost.test(host)

/** The default lock read: one balance per wallet, in the token's base units. */
const DefaultLockRead =
  "function lockedBalanceOf(address account) view returns (uint256)"

/**
 * The Homebase wallet: the admin wherever HOMEBASE_ADMIN_ADDRESSES names no
 * one, so a deployment adds events out of the box. A list in the environment
 * replaces it rather than adding to it.
 */
export const DefaultAdmins: readonly string[] = [
  "0x3D140B892437dD7857701098415deB2daaE03A40",
]

export function configFrom(
  env: Record<string, string | undefined>,
): AuthConfig {
  const contract = env.HOMEBASE_LOCK_CONTRACT?.trim()

  if (
    contract && !Address.validate(contract, {
      strict: false,
    })
  ) {
    throw new Error("HOMEBASE_LOCK_CONTRACT is not an address")
  }

  const listed = (env.HOMEBASE_ADMIN_ADDRESSES ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) =>
      address && Address.validate(address, {
        strict: false,
      })
    )

  return {
    adminAddresses: listed.length > 0 ? listed : DefaultAdmins,
    lock: contract
      ? {
        contract,
        read: AbiFunction.from(
          env.HOMEBASE_LOCK_READ?.trim() || DefaultLockRead,
        ) as AbiFunction.AbiFunction,
        amountIndex: Number(env.HOMEBASE_LOCK_AMOUNT_INDEX ?? 0),
        endIndex: env.HOMEBASE_LOCK_END_INDEX
          ? Number(env.HOMEBASE_LOCK_END_INDEX)
          : null,
        min: BigInt(env.HOMEBASE_LOCK_MIN?.trim() || "1"),
      }
      : null,
    rpc: env.HOMEBASE_BASE_RPC || BaseRpcUrl,
    cronSecret: env.CRON_SECRET?.trim() || null,
    siteHosts: new Set(
      [
        ...(env.HOMEBASE_SITE_HOSTS ?? "").split(","),
        // Vercel names its own hosts, so a deployment there needs no setting.
        env.VERCEL_PROJECT_PRODUCTION_URL ?? "",
        env.VERCEL_BRANCH_URL ?? "",
        env.VERCEL_URL ?? "",
      ]
        .map(hostOf)
        .filter((host): host is string => host !== null),
    ),
  }
}

/**
 * Whether a sign-in may be issued and accepted for a host. With no hosts
 * configured only the local ones pass, so a deployment that forgot the setting
 * fails closed instead of binding messages to whatever a request names.
 */
export function siteAllowed(config: AuthConfig, host: string): boolean {
  const name = hostOf(host)

  if (!name) {
    return false
  }

  return config.siteHosts.size === 0
    ? LocalHost.test(name)
    : config.siteHosts.has(name)
}

const sha256 = (value: string) =>
  NCrypto.createHash("sha256").update(value).digest()

/** Compares in constant time; hashing first keeps the lengths equal. */
function sameSecret(presented: string, configured: string): boolean {
  return NCrypto.timingSafeEqual(sha256(presented), sha256(configured))
}

const tokenHash = (token: string) => sha256(token).toString("hex")

const SessionToken = /^[0-9a-f]{64}$/

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  const match = header.match(/^Bearer\s+(\S+)$/i)

  return match ? match[1] : null
}

/** The wallet session behind the Authorization header, if it is live. */
export async function authenticate(
  request: Request,
  store: Store,
  now: Date,
): Promise<Actor | null> {
  const token = bearer(request)

  if (!token || !SessionToken.test(token)) {
    return null
  }

  const session = await Repo.findSession(
    store,
    tokenHash(token),
    now.toISOString(),
  )

  return session
    ? {
      role: session.role as Role,
      address: session.address,
      expiresAt: session.expiresAt,
    }
    : null
}

export async function signOut(
  request: Request,
  store: Store,
): Promise<void> {
  const token = bearer(request)

  if (token && SessionToken.test(token)) {
    await Repo.deleteSession(store, tokenHash(token))
  }
}

/** Vercel's cron calls carry the deployment's CRON_SECRET. */
export function isCron(request: Request, config: AuthConfig): boolean {
  const token = bearer(request)

  return !!token && !!config.cronSecret && sameSecret(token, config.cronSecret)
}

export interface Failure {
  readonly error: string
  readonly status: number
}

const fail = (status: number, error: string): Failure => ({
  error,
  status,
})

export const isFailure = (value: object): value is Failure => "error" in value

/**
 * Writes the message a wallet signs. The server authors it, so the domain,
 * the chain and the nonce are its own rather than the client's.
 */
export async function issueSignIn(
  store: Store,
  input: {
    readonly address: string
    readonly domain: string
    readonly origin: string
  },
  now: Date,
): Promise<
  | {
    readonly message: string
  }
  | Failure
> {
  if (
    !Address.validate(input.address, {
      strict: false,
    })
  ) {
    return fail(400, "That is not an Ethereum address.")
  }

  const address = Address.checksum(input.address)
  const nonce = NCrypto.randomBytes(16).toString("hex")
  const expiresAt = new Date(now.getTime() + NonceTtlMs)

  let message: string

  try {
    message = Siwe.createMessage({
      address,
      chainId: BaseChainId,
      domain: input.domain,
      uri: input.origin,
      version: "1",
      nonce,
      statement: Statement,
      issuedAt: now,
      expirationTime: expiresAt,
    })
  } catch (error) {
    console.error("Could not write a sign-in message:", error)

    return fail(400, "Sign-in isn't available from this address.")
  }

  await Repo.purgeNonces(store, now.toISOString())
  await Repo.insertNonce(store, {
    nonce,
    address,
    domain: input.domain,
    expiresAt: expiresAt.toISOString(),
  })

  return {
    message,
  }
}

export interface SignedIn {
  readonly actor: Actor
  readonly token: string
}

export interface VerifyDeps {
  readonly fetch: typeof fetch
  readonly now: Date
  readonly domain: string
}

/** Checks a signed message against the nonce it was issued with and opens a session. */
export async function verifySignIn(
  store: Store,
  input: {
    readonly message: string
    readonly signature: string
  },
  config: AuthConfig,
  deps: VerifyDeps,
): Promise<SignedIn | Failure> {
  let fields: ReturnType<typeof Siwe.parseMessage>

  try {
    fields = Siwe.parseMessage(input.message)
  } catch {
    return fail(400, "That sign-in message can't be read.")
  }

  if (
    !fields.address
    || !Address.validate(fields.address, {
      strict: false,
    })
    || !fields.nonce
  ) {
    return fail(400, "That sign-in message can't be read.")
  }

  if (fields.version !== "1" || fields.chainId !== BaseChainId) {
    return fail(400, "That sign-in message isn't for Homebase on Base.")
  }

  if (fields.domain !== deps.domain) {
    return fail(400, "That sign-in message was issued for another site.")
  }

  if (
    !fields.expirationTime
    || !Siwe.validateMessage({
      message: fields,
      domain: deps.domain,
      time: deps.now,
    })
  ) {
    return fail(401, "That sign-in request expired. Try again.")
  }

  if (!Hex.validate(input.signature) || Hex.size(input.signature) === 0) {
    return fail(400, "That signature can't be read.")
  }

  const nonce = await Repo.consumeNonce(
    store,
    fields.nonce,
    deps.now.toISOString(),
  )

  if (!nonce) {
    return fail(401, "That sign-in request expired. Try again.")
  }

  if (
    !Address.isEqual(nonce.address as Address.Address, fields.address)
    || nonce.domain !== fields.domain
  ) {
    return fail(401, "That sign-in message doesn't match the request.")
  }

  const signature = input.signature as Hex.Hex
  const payload = PersonalMessage.getSignPayload(Hex.fromString(input.message))
  let valid = false

  if (Hex.size(signature) === 65) {
    try {
      valid = Address.isEqual(
        Secp256k1.recoverAddress({
          payload,
          signature: Signature.fromHex(signature),
        }),
        fields.address,
      )
    } catch {
      valid = false
    }
  }

  if (!valid) {
    try {
      valid = await validSignatureOnBase(
        config.rpc,
        fields.address,
        payload,
        signature,
        deps.fetch,
      )
    } catch (error) {
      console.error("Could not check a signature on Base:", error)

      return fail(502, "Couldn't reach Base to check the signature. Try again.")
    }
  }

  if (!valid) {
    return fail(401, "The signature doesn't match the wallet.")
  }

  const address = Address.checksum(fields.address)
  let role: Role | null

  try {
    role = await authorizeAddress(address, config, deps)
  } catch (error) {
    console.error("Could not read the $home lock:", error)

    return fail(502, "Couldn't check the $home lock right now. Try again.")
  }

  if (!role) {
    return fail(
      403,
      config.lock
        ? "This wallet hasn't locked enough $home to add events."
        : "This wallet can't add events yet. Homebase admins can now, and $home lockers will be able to soon.",
    )
  }

  const token = NCrypto.randomBytes(32).toString("hex")
  const nowIso = deps.now.toISOString()
  const expiresAt = new Date(
    deps.now.getTime() + (role === "admin" ? AdminSessionMs : LockerSessionMs),
  )
    .toISOString()

  await Repo.purgeSessions(store, nowIso)
  await Repo.insertSession(store, {
    tokenHash: tokenHash(token),
    address,
    role,
    expiresAt,
    createdAt: nowIso,
  })

  return {
    actor: {
      role,
      address,
      expiresAt,
    },
    token,
  }
}

/** The admin list first, then the lock, when one is configured. */
async function authorizeAddress(
  address: string,
  config: AuthConfig,
  deps: Pick<VerifyDeps, "fetch" | "now">,
): Promise<Role | null> {
  if (
    config.adminAddresses.some((admin) =>
      Address.isEqual(admin as Address.Address, address as Address.Address)
    )
  ) {
    return "admin"
  }

  if (
    config.lock
    && await hasLock(config.lock, config.rpc, address, deps.fetch, deps.now)
  ) {
    return "locker"
  }

  return null
}

class RpcError extends Error {}

type CallAnswer =
  | {
    readonly result: Hex.Hex
  }
  | {
    readonly reverted: true
  }

async function ethCall(
  rpc: string,
  call: {
    readonly to?: string
    readonly data: Hex.Hex
  },
  fetchFn: typeof fetch,
): Promise<CallAnswer> {
  const response = await fetchFn(rpc, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        call,
        "latest",
      ],
    }),
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new RpcError(`Base RPC responded with ${response.status}`)
  }

  const { result, error } = await response.json()

  if (typeof result === "string") {
    return {
      result: result as Hex.Hex,
    }
  }

  if (
    error && (error.code === 3 || /revert/i.test(String(error.message ?? "")))
  ) {
    return {
      reverted: true,
    }
  }

  throw new RpcError("Base RPC refused the read", {
    cause: error,
  })
}

const Validator = AbiConstructor.fromAbi(
  WrappedSignature.universalSignatureValidatorAbi,
)

/**
 * Runs ERC-6492's universal validator as a deployless call: it deploys a
 * counterfactual wallet inside the call if the signature asks for it, asks a
 * deployed wallet through ERC-1271, and falls back to recovery otherwise.
 */
async function validSignatureOnBase(
  rpc: string,
  signer: string,
  payload: Hex.Hex,
  signature: Hex.Hex,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const data = AbiConstructor.encode(Validator, {
    bytecode: WrappedSignature.universalSignatureValidatorBytecode,
    args: [
      signer as Address.Address,
      payload,
      signature,
    ],
  })
  const answer = await ethCall(
    rpc,
    {
      data,
    },
    fetchFn,
  )

  if ("reverted" in answer) {
    return false
  }

  return answer.result !== "0x" && BigInt(answer.result) === 1n
}

/** Whether the wallet's lock reaches the configured minimum and has not ended. */
async function hasLock(
  lock: LockConfig,
  rpc: string,
  address: string,
  fetchFn: typeof fetch,
  now: Date,
): Promise<boolean> {
  const data = AbiFunction.encodeData(lock.read, [
    address,
  ] as never)
  const answer = await ethCall(
    rpc,
    {
      to: lock.contract,
      data,
    },
    fetchFn,
  )

  if ("reverted" in answer || answer.result === "0x") {
    return false
  }

  const decoded: unknown = AbiFunction.decodeResult(lock.read, answer.result)
  const outputs = Array.isArray(decoded)
    ? decoded
    : [
      decoded,
    ]
  const amount = BigInt(outputs[lock.amountIndex] as bigint)
  const end = lock.endIndex === null
    ? null
    : BigInt(outputs[lock.endIndex] as bigint)

  if (end !== null && end !== 0n && Number(end) * 1000 <= now.getTime()) {
    return false
  }

  return amount >= lock.min
}
