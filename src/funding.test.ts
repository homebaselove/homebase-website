import { expect, test } from "bun:test"
import * as AbiParameters from "ox/AbiParameters"
import * as Hash from "ox/Hash"
import {
  BaseRpcUrl as ServerRpcUrl,
  earnedWei,
  FundingAddress,
  HomePoolId,
} from "../api/funding.ts"
import {
  BasedHouseMumbaiApplyUrl,
  BaseRpcUrl,
  DonationAddress,
  etherAmount,
  formatEth,
  HomeTokenUrl,
  nextMilestone,
  PresetsEth,
  SeedMeLockUrl,
  segmentFills,
  transactionUrl,
} from "./funding.ts"
import { Chapters } from "./story.ts"

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

test("earned is the address's share of all the fees the ledger has taken", () => {
  // The share recorded on Base, with the pool's fees sized so it comes to the
  // 1.061413 WETH Bankr's terminal showed the address as claimable.
  expect(
    earnedWei({
      shares: 482758620689655174n,
      cumulatedFees0: 0n,
      beneficiaryFees0: 2198641214285714279n,
    }),
  )
    .toBe(1_061_413_000_000_000_000n)
})

test("collecting the fees leaves earned standing", () => {
  const shares = 482758620689655174n

  expect(
    [
      earnedWei({
        shares,
        cumulatedFees0: 0n,
        beneficiaryFees0: 3n * 10n ** 18n,
      }),
      earnedWei({
        shares,
        cumulatedFees0: 3n * 10n ** 18n,
        beneficiaryFees0: 0n,
      }),
    ],
  )
    .toEqual([
      1_448_275_862_068_965_522n,
      1_448_275_862_068_965_522n,
    ])
})

test("the pool is $home's, and WETH is its 0 side", () => {
  const weth = "0x4200000000000000000000000000000000000006"
  const home = "0xB9A1E52f3ED678B01Ff5e256fDe43f26f9C01bA3"
  const key = AbiParameters.encode(
    AbiParameters.from([
      "address currency0",
      "address currency1",
      "uint24 fee",
      "int24 tickSpacing",
      "address hooks",
    ]),
    [
      weth,
      home,
      // Doppler's flag for a fee its hook sets.
      0x800000,
      200,
      // Doppler's hook initializer, which launched the pool.
      "0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544",
    ],
  )

  expect(
    [
      Hash.keccak256(key),
      BigInt(weth) < BigInt(home),
    ],
  )
    .toEqual([
      HomePoolId,
      true,
    ])
})

test("the card links the pool whose fees it counts", () => {
  expect(
    HomeTokenUrl,
  )
    .toBe(`https://dexscreener.com/base/${HomePoolId}`)
})

test("a donation goes to the same address whose fees the card counts", () => {
  expect(
    DonationAddress,
  )
    .toBe(FundingAddress)
  expect(
    BaseRpcUrl,
  )
    .toBe(ServerRpcUrl)
})

test("a landed transaction links to its page on BaseScan", () => {
  expect(
    transactionUrl("0xabc"),
  )
    .toBe("https://basescan.org/tx/0xabc")
})

test("an amount reaches the wallet exactly as the person means it", () => {
  expect(
    [
      "0.1",
      "0.01",
      "0.001",
      "1",
      "00.500",
      ".25",
      "2.",
      "1e-3",
      "0.1234567890123456789",
    ]
      .map(etherAmount),
  )
    .toEqual([
      "0.1",
      "0.01",
      "0.001",
      "1",
      "0.5",
      "0.25",
      "2",
      "0.001",
      "0.123456789012345678",
    ])
})

test("anything that is not an amount above zero is refused", () => {
  expect(
    [
      "",
      "0",
      "0.000",
      "-1",
      "-1e-3",
      "abc",
      "1e21",
      "0.0000000000000000001",
    ]
      .map(etherAmount),
  )
    .toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ])
})

test("every preset amount is offered exactly as it is sent", () => {
  expect(
    PresetsEth.map((preset) => etherAmount(String(preset))),
  )
    .toEqual(PresetsEth.map((preset) => formatEth(preset)))
})

test("the funding card and the story apply through the same form", () => {
  const today = Chapters.find((chapter) => chapter.id === "today")

  expect(
    today?.links.map((link) => link.href),
  )
    .toContain(BasedHouseMumbaiApplyUrl)
  expect(
    BasedHouseMumbaiApplyUrl,
  )
    .toBe("https://forms.gle/Jc6an9SCdYaP95us9")
})
