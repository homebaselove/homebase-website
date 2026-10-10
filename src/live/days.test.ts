import { expect, test } from "bun:test"
import { dayOf, dayTitle, zoneLabel, zoneList } from "./days.ts"

test("an event falls on the day of its zone, across the date line", () => {
  const noon = {
    allDay: false,
    start: "2026-10-15T12:00:00.000Z",
  }

  expect(
    [
      dayOf(noon, "Pacific/Kiritimati"),
      dayOf(noon, "Pacific/Honolulu"),
      dayOf({
        allDay: true,
        start: "2026-10-15T00:00:00.000Z",
      }, "Pacific/Honolulu"),
    ],
  )
    .toEqual([
      "2026-10-16",
      "2026-10-15",
      "2026-10-15",
    ])
})

test("Today and Tomorrow follow the calendar in the zone", () => {
  const now = new Date("2026-10-15T09:00:00Z")

  expect(
    [
      dayTitle("2026-10-15", "Europe/Lisbon", now),
      dayTitle("2026-10-16", "Europe/Lisbon", now),
      dayTitle("2026-10-17", "Europe/Lisbon", now),
    ],
  )
    .toEqual([
      "Today · Thursday, October 15",
      "Tomorrow · Friday, October 16",
      "Saturday, October 17",
    ])
})

test("the evening before clocks go forward, tomorrow is the next date", () => {
  // 23:30 in New York on March 13, 2027; the clocks go forward that night,
  // so 24 hours later is already March 15.
  const now = new Date("2027-03-14T04:30:00Z")

  expect(
    [
      dayTitle("2027-03-13", "America/New_York", now),
      dayTitle("2027-03-14", "America/New_York", now),
      dayTitle("2027-03-15", "America/New_York", now),
    ],
  )
    .toEqual([
      "Today · Saturday, March 13",
      "Tomorrow · Sunday, March 14",
      "Monday, March 15",
    ])
})

test("in the repeated hour as clocks go back, tomorrow is still the next date", () => {
  // 00:30 in New York on November 7, 2027, the day the clocks go back.
  const now = new Date("2027-11-07T04:30:00Z")

  expect(
    [
      dayTitle("2027-11-07", "America/New_York", now),
      dayTitle("2027-11-08", "America/New_York", now),
    ],
  )
    .toEqual([
      "Today · Sunday, November 7",
      "Tomorrow · Monday, November 8",
    ])
})

test("a zone reads as its city, its region and its offset", () => {
  const now = new Date("2026-01-15T12:00:00Z")

  expect(
    [
      zoneLabel("Asia/Kolkata", now),
      zoneLabel("America/Argentina/Buenos_Aires", now),
      zoneLabel("Pacific/Kiritimati", now),
      zoneLabel("UTC", now),
    ],
  )
    .toEqual([
      "Kolkata, Asia · GMT+5:30",
      "Buenos Aires, America · GMT-3",
      "Kiritimati, Pacific · GMT+14",
      "UTC",
    ])
})

test("the zone list always holds the viewer's zone and UTC, once each, by city", () => {
  const zones = zoneList(
    "Europe/Lisbon",
    [
      "Pacific/Kiritimati",
      "Europe/Lisbon",
      "Asia/Kolkata",
    ],
    new Date("2026-01-15T12:00:00Z"),
  )

  expect(
    zones.map((zone) => zone.id),
  )
    .toEqual([
      "Pacific/Kiritimati",
      "Asia/Kolkata",
      "Europe/Lisbon",
      "UTC",
    ])
})
