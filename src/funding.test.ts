import { expect, test } from "bun:test"
import { creatorFeesUrl, FundingAddress, raisedFrom } from "../api/funding.ts"
import {
  formatEth,
  nextMilestone,
  SeedMeLockUrl,
  segmentFills,
} from "./funding.ts"

test("next milestone steps past the amount already raised", () => {
  expect(
    nextMilestone(4.62),
  )
    .toBe(5)
})

test("landing exactly on a milestone moves to the following one", () => {
  expect(
    nextMilestone(5),
  )
    .toBe(6)
})

test("next milestone never runs past the target", () => {
  expect(
    nextMilestone(10),
  )
    .toBe(10)
})

test("segments fill whole, then part, then empty", () => {
  expect(
    segmentFills(4.62),
  )
    .toEqual([
      1,
      1,
      1,
      1,
      0.6200000000000001,
      0,
      0,
      0,
      0,
      0,
    ])
})

test("milestones and segments follow the segment size", () => {
  expect(
    [
      nextMilestone(4.62, 20, 10),
      segmentFills(3, 20, 4),
    ],
  )
    .toEqual([
      6,
      [
        0.6,
        0,
        0,
        0,
      ],
    ])
})

test("amounts read without trailing zeros", () => {
  expect(
    [
      formatEth(4.62),
      formatEth(5),
      formatEth(10),
      formatEth(0.001),
      formatEth(0.1),
    ],
  )
    .toEqual([
      "4.62",
      "5",
      "10",
      "0.001",
      "0.1",
    ])
})

test("amounts round to two places from one ETH and four below", () => {
  expect(
    [
      formatEth(4.6234),
      formatEth(1.2345),
      formatEth(0.00049),
    ],
  )
    .toEqual([
      "4.62",
      "1.23",
      "0.0005",
    ])
})

test("the lock card points at SeedMe's lock page", () => {
  expect(
    SeedMeLockUrl,
  )
    .toBe("https://seedme.xyz/lock")
})

test("raised is the lifetime total, not claimed plus claimable", () => {
  expect(
    raisedFrom({
      lifetimeEarnedWeth: "12.5406",
      totals: {
        claimedWeth: "0.000000",
        claimableWeth: "0.018885",
      },
    }),
  )
    .toBe(12.5406)
})

test("numbers are accepted as readily as strings", () => {
  expect(
    raisedFrom({
      lifetimeEarnedWeth: 4.62,
    }),
  )
    .toBe(4.62)
})

test("a lifetime of zero reads as zero", () => {
  expect(
    raisedFrom({
      lifetimeEarnedWeth: "0",
    }),
  )
    .toBe(0)
})

test("a payload without a lifetime total reads as nothing, not as zero", () => {
  expect(
    [
      raisedFrom(null),
      raisedFrom({}),
      raisedFrom({
        lifetimeEarnedWeth: "",
      }),
      raisedFrom({
        lifetimeEarnedWeth: " ",
      }),
      raisedFrom({
        lifetimeEarnedWeth: "not a number",
      }),
      raisedFrom({
        totals: {
          claimedWeth: "1",
          claimableWeth: "2",
        },
      }),
    ],
  )
    .toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ])
})

test("a negative or unbounded figure is no answer", () => {
  expect(
    [
      raisedFrom({
        lifetimeEarnedWeth: "-5",
      }),
      raisedFrom({
        lifetimeEarnedWeth: "1e999",
      }),
    ],
  )
    .toEqual([
      null,
      null,
    ])
})

test("the fees url needs no key and names the recipient", () => {
  expect(
    creatorFeesUrl(FundingAddress),
  )
    .toBe(
      "https://api.bankr.bot/public/doppler/creator-fees/"
        + "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3",
    )
})
