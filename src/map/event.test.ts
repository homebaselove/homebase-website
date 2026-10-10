import { expect, test } from "bun:test"
import { placeOf } from "./event.ts"
import { describeWhen } from "./time.ts"

const Venue = {
  placement: "venue" as const,
  venue: "Village Underground",
  address: "Rua Maria Luisa Holstein 20, Lisbon",
  city: "Lisbon",
}

test("a row names the venue and the city, a card the venue and the address", () => {
  expect(
    [
      placeOf(Venue, "short"),
      placeOf(Venue, "full"),
    ],
  )
    .toEqual([
      "Village Underground · Lisbon",
      "Village Underground, Rua Maria Luisa Holstein 20, Lisbon",
    ])
})

test("a venue kept for guests names its city, and says why on the card", () => {
  const hidden = {
    ...Venue,
    placement: "hidden" as const,
    venue: null,
    address: null,
  }

  expect(
    [
      placeOf(hidden, "short"),
      placeOf(hidden, "full"),
    ],
  )
    .toEqual([
      "Lisbon",
      "Lisbon. The exact address is shared with guests on Luma.",
    ])
})

test("an online event, and one with no place yet, read the same everywhere", () => {
  const nowhere = {
    placement: "unknown" as const,
    venue: null,
    address: null,
    city: null,
  }

  expect(
    [
      placeOf({
        ...nowhere,
        placement: "online",
      }, "short"),
      placeOf(nowhere, "short"),
      placeOf(nowhere, "full"),
    ],
  )
    .toEqual([
      "Online",
      "Location to be announced",
      "Location to be announced",
    ])
})

test("an event held somewhere reads in its own zone, with the viewer's alongside", () => {
  const when = describeWhen(
    {
      start: "2026-10-15T17:00:00Z",
      end: "2026-10-15T20:00:00Z",
      timezone: "Europe/Lisbon",
      placement: "venue",
    },
    "America/New_York",
    new Date("2026-10-09T12:00:00Z"),
  )

  expect(
    when,
  )
    .toEqual({
      date: "Thu, Oct 15",
      time: "6:00 PM – 9:00 PM GMT+1",
      yours: "1:00 PM EDT where you are",
    })
})

test("an online event reads in the viewer's own zone", () => {
  const when = describeWhen(
    {
      start: "2026-10-15T17:00:00Z",
      end: "2026-10-15T18:00:00Z",
      timezone: "Europe/Lisbon",
      placement: "online",
    },
    "America/New_York",
    new Date("2026-10-09T12:00:00Z"),
  )

  expect(
    when,
  )
    .toEqual({
      date: "Thu, Oct 15",
      time: "1:00 PM – 2:00 PM EDT",
      yours: null,
    })
})
