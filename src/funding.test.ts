import { expect, test } from "bun:test"
import { raisedFrom } from "../api/funding.ts"
import {
  bankrCreatorFeesUrl,
  formatEth,
  FundingAddress,
  nextMilestone,
  raisedFromCreatorFees,
  SeedMeLockUrl,
  SeedMeUrl,
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

test("an overshot raise leaves every segment full", () => {
  expect(
    segmentFills(12),
  )
    .toEqual([
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
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

test("buy and donate point at the seedme home page", () => {
  expect(
    SeedMeUrl,
  )
    .toBe("https://seedme.xyz")
})

test("the lock card points at SeedMe's lock page", () => {
  expect(
    SeedMeLockUrl,
  )
    .toBe("https://seedme.xyz/lock")
})

test("the funding address is a checksummed 0x address", () => {
  expect(
    /^0x[0-9a-fA-F]{40}$/.test(FundingAddress),
  )
    .toBe(true)
})

test("the serverless function falls back to the same address", async () => {
  const serverless = await Bun
    .file(new URL("../api/funding.ts", import.meta.url))
    .text()

  expect(
    serverless.includes(FundingAddress),
  )
    .toBe(true)
})

test("raised reads what the fees earned, claimed or not", () => {
  expect(
    raisedFromCreatorFees({
      lifetimeEarnedWeth: "4.62",
      totals: {
        claimedWeth: "0.0005",
        claimableWeth: "4.6195",
      },
    }),
  )
    .toBe(4.62)
})

test("without a lifetime total, claimed and claimable are added", () => {
  expect(
    raisedFromCreatorFees({
      totals: {
        claimedWeth: "0.0005",
        claimableWeth: "4.6195",
      },
    }),
  )
    .toBe(4.62)
})

test("a claim that has not happened yet still counts", () => {
  expect(
    raisedFromCreatorFees({
      totals: {
        claimedWeth: "0",
        claimableWeth: "4.62",
      },
    }),
  )
    .toBe(4.62)
})

test("numbers are accepted as readily as strings", () => {
  expect(
    raisedFromCreatorFees({
      lifetimeEarnedWeth: 4.62,
    }),
  )
    .toBe(4.62)
})

test("a payload carrying no fees reads as nothing, not as zero", () => {
  expect(
    [
      raisedFromCreatorFees({}),
      raisedFromCreatorFees({
        lifetimeEarnedWeth: "not a number",
      }),
      raisedFromCreatorFees({
        totals: {},
      }),
    ],
  )
    .toEqual([
      null,
      null,
      null,
    ])
})

test("the serverless copy of the parser agrees with this one", () => {
  const payloads = [
    {
      lifetimeEarnedWeth: "4.62",
    },
    {
      totals: {
        claimedWeth: "0.0005",
        claimableWeth: "4.6195",
      },
    },
    {
      totals: {
        claimedWeth: "0",
        claimableWeth: "4.62",
      },
    },
    {
      lifetimeEarnedWeth: 4.62,
    },
    {},
    {
      lifetimeEarnedWeth: "not a number",
    },
  ]

  expect(
    payloads.map(raisedFrom),
  )
    .toEqual(payloads.map(raisedFromCreatorFees))
})

test("the fees url needs no key and names the recipient", () => {
  expect(
    bankrCreatorFeesUrl(FundingAddress),
  )
    .toBe(
      "https://api.bankr.bot/public/doppler/creator-fees/"
        + "0x23cEBf0E3529a3Af4756eFAe22E56B9797f008E3",
    )
})
