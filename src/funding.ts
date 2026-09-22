/**
 * Funding card configuration and the milestone math behind it.
 *
 * Dependency-free on purpose: the client bundle, the Bun route and the Vercel
 * function all read from here.
 */

/** Where the buy and donate buttons send people. */
export const SeedMeUrl = "https://seedme.xyz"

/** What the raise is for, as it reads on the card. */
export const Campaign = "Based House"

/** The full raise, in ETH. */
export const TargetEth = 10

/** Segments in the milestone bar, each worth TargetEth / SegmentCount. */
export const SegmentCount = 10

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

/** Trims to the shortest reading that still carries the amount. */
export function formatEth(value: number): string {
  return value
    .toFixed(value >= 1 ? 2 : 4)
    .replace(/\.?0+$/, "")
}

/** Wei, hex or decimal, as a number of ETH. */
export function weiToEth(wei: string | bigint): number {
  const value = typeof wei === "bigint" ? wei : BigInt(wei)
  const unit = 10n ** 18n

  return Number(value / unit) + Number(value % unit) / 1e18
}

/** Deep link into SeedMe with the amount the card has selected. */
export function seedMeUrl(
  action: "buy" | "donate",
  amountEth: number | null,
): string {
  const url = new URL(SeedMeUrl)

  url.searchParams.set("action", action)

  if (amountEth !== null && amountEth > 0) {
    url.searchParams.set("amount", String(amountEth))
  }

  return url.toString()
}
