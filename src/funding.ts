/**
 * Funding card configuration and the milestone math behind it, bundled into
 * the client. The fee read lives in api/funding.ts, which the Vercel function
 * and the Bun route both serve.
 */

/** Where the buy and donate buttons send people. */
export const SeedMeUrl = "https://seedme.xyz"

/** Where the lock card sends people, matching SeedMe's own nav. */
export const SeedMeLockUrl = `${SeedMeUrl}/lock`

/**
 * Where a donation from a connected wallet goes: the Based House wallet,
 * the same address whose $home fees the card counts, written out here so
 * the page carries no chain code. api/funding.ts holds the same address, and
 * a test keeps the two together.
 */
export const DonationAddress = "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3"

/** Base's public RPC, for the page to wait on a donation it sent. */
export const BaseRpcUrl = "https://mainnet.base.org"

/** Where a landed transaction can be seen. */
export const transactionUrl = (hash: string) =>
  `https://basescan.org/tx/${hash}`

/** $home, on the pool the socials row already points at. */
export const HomeTokenUrl =
  "https://dexscreener.com/base/0xcfa6173616804aa9974bf7a648149a98b5ce64251f3ed0b9852dd3dc0d8caa24"

/**
 * The application to Based House Mumbai, where the raise is headed: the
 * funding card and the story's Apply button both open it.
 */
export const BasedHouseMumbaiApplyUrl = "https://forms.gle/Jc6an9SCdYaP95us9"

/** What the raise is for, as it reads on the card. */
export const Campaign = "Based House"

/** The full raise, in ETH. */
export const TargetEth = 10

/** Segments in the milestone bar, each worth TargetEth / SegmentCount. */
const SegmentCount = 10

/** Amounts offered next to the custom field. */
export const PresetsEth = [0.001, 0.01, 0.1]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const segmentEth = (target: number, count: number) => target / count

/** The next segment boundary the raise is working toward, capped at target. */
export function nextMilestone(
  raised: number,
  target: number = TargetEth,
  count: number = SegmentCount,
): number {
  const step = segmentEth(target, count)

  return Math.min(target, (Math.floor(raised / step) + 1) * step)
}

/** How full each segment of the milestone bar is, from 0 to 1. */
export function segmentFills(
  raised: number,
  target: number = TargetEth,
  count: number = SegmentCount,
): number[] {
  const step = segmentEth(target, count)

  return Array.from(
    {
      length: count,
    },
    (_, index) => clamp((raised - index * step) / step, 0, 1),
  )
}

/** Ether has 18 decimal places; anything finer is not an amount. */
const EtherDecimals = 18

/** How far an exponent may move the point, which bounds the text it makes. */
const MaxShift = 60

/**
 * An amount of ether as the plain decimal text the wallet is given and the
 * Donate button names, or null when it is not an amount above zero. It works
 * on the digits as text, never through a float: 0.1 as a float written to 18
 * places is 0.100000000000000006, which would send six wei too many. A number
 * field may also hold an exponent, such as 1e-3, which moves the point.
 */
export function etherAmount(typed: string): string | null {
  const parts = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(typed.trim())

  if (!parts || !(parts[1] || parts[2])) {
    return null
  }

  const [, whole = "", fraction = "", exponent = "0"] = parts
  const shift = Number(exponent)

  if (Math.abs(shift) > MaxShift) {
    return null
  }

  const digits = whole + fraction
  const point = whole.length + shift
  const before = point <= 0
    ? "0"
    : digits.slice(0, point).padEnd(point, "0")
  const after = point <= 0
    ? "0".repeat(-point) + digits
    : digits.slice(point)
  const units = before.replace(/^0+(?=\d)/, "")
  const places = after.slice(0, EtherDecimals).replace(/0+$/, "")
  const amount = places ? `${units}.${places}` : units

  return /[1-9]/.test(amount) ? amount : null
}

/** Trims to the shortest reading that still carries the amount. */
export function formatEth(value: number): string {
  return value
    .toFixed(value >= 1 ? 2 : 4)
    .replace(/\.?0+$/, "")
}
