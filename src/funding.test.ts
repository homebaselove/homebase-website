import { expect, test } from "bun:test"
import {
  formatEth,
  nextMilestone,
  seedMeUrl,
  segmentFills,
  weiToEth,
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

test("wei converts to eth from hex and from decimal", () => {
  expect(
    [
      weiToEth("0x401d8985ae4e0000"),
      weiToEth("4620000000000000000"),
      weiToEth(0n),
    ],
  )
    .toEqual([
      4.62,
      4.62,
      0,
    ])
})

test("the selected amount rides along to seedme", () => {
  expect(
    seedMeUrl("buy", 0.01),
  )
    .toBe("https://seedme.xyz/?action=buy&amount=0.01")
})

test("no amount selected leaves the link bare", () => {
  expect(
    seedMeUrl("donate", null),
  )
    .toBe("https://seedme.xyz/?action=donate")
})
