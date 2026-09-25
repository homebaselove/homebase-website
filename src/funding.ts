/**
 * Funding card configuration and the milestone math behind it, bundled into
 * the client. The fee read lives in api/funding.ts, which the Vercel function
 * and the Bun route both serve.
 */

/** Where the buy and donate buttons send people. */
export const SeedMeUrl = "https://seedme.xyz"

/** Where the lock card sends people, matching SeedMe's own nav. */
export const SeedMeLockUrl = `${SeedMeUrl}/lock`

/** $home, on the pool the socials row already points at. */
export const HomeTokenUrl =
  "https://dexscreener.com/base/0xcfa6173616804aa9974bf7a648149a98b5ce64251f3ed0b9852dd3dc0d8caa24"

/** The Based House Mumbai form, where the raise is headed. */
export const BasedHouseMumbaiUrl = "https://forms.gle/ZKkD9fCnBCx5pitv9"

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

/** Trims to the shortest reading that still carries the amount. */
export function formatEth(value: number): string {
  return value
    .toFixed(value >= 1 ? 2 : 4)
    .replace(/\.?0+$/, "")
}
