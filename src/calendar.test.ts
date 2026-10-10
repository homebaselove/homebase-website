import { expect, test } from "bun:test"
import {
  escapeText,
  fold,
  googleCalendarUrl,
  icsFile,
  icsName,
} from "./calendar.ts"

const Evening = {
  title: "Lisbon build night; demos, food",
  start: new Date("2026-10-15T18:00:00Z"),
  end: new Date("2026-10-15T21:00:00Z"),
  description: "Bring a laptop.\nAnd a friend.",
  location: "Village Underground, Lisbon",
  url: "https://luma.com/lisbon-build-night",
}

const Stamp = new Date("2026-10-09T12:00:00Z")

const lines = (file: string) => file.split("\r\n")

test("an iCalendar file carries the UID and DTSTAMP every event must have", () => {
  const file = lines(icsFile(Evening, Stamp))

  expect(
    file.filter((line) => /^(UID|DTSTAMP|DTSTART|DTEND):/.test(line)),
  )
    .toEqual([
      expect.stringMatching(/^UID:[0-9a-f]{8}@homebase\.love$/),
      "DTSTAMP:20261009T120000Z",
      "DTSTART:20261015T180000Z",
      "DTEND:20261015T210000Z",
    ])
})

test("an iCalendar file ends every line, the last too, with CRLF", () => {
  const file = icsFile(Evening, Stamp)

  expect(
    file.endsWith("END:VCALENDAR\r\n"),
  )
    .toBe(true)
  expect(
    file.replaceAll("\r\n", "").includes("\n"),
  )
    .toBe(false)
})

test("text escapes the characters RFC 5545 reserves, and a colon stays", () => {
  expect(
    escapeText("a\\b; c, d: e\nf"),
  )
    .toBe("a\\\\b\\; c\\, d: e\\nf")
})

test("the summary, description and location are escaped in the file", () => {
  const file = icsFile(Evening, Stamp)

  expect(
    file.includes("SUMMARY:Lisbon build night\\; demos\\, food"),
  )
    .toBe(true)
  expect(
    file.includes("LOCATION:Village Underground\\, Lisbon"),
  )
    .toBe(true)
  expect(
    file.replaceAll("\r\n ", "").includes(
      "DESCRIPTION:Bring a laptop.\\nAnd a friend.\\n\\nhttps://luma.com/lisbon-build-night",
    ),
  )
    .toBe(true)
})

test("long lines fold at 75 octets without splitting a character", () => {
  const line = `SUMMARY:${"é".repeat(60)}`
  const folded = fold(line)
  const encoder = new TextEncoder()

  expect(
    folded
      .split("\r\n")
      .every((part) => encoder.encode(part).length <= 75),
  )
    .toBe(true)
  expect(
    folded.replaceAll("\r\n ", ""),
  )
    .toBe(line)
})

test("an all-day event is written as dates, through the day after", () => {
  const file = lines(icsFile(
    {
      title: "Onchain summer kickoff",
      start: new Date("2026-10-13T00:00:00Z"),
      end: new Date("2026-10-13T00:00:00Z"),
      allDay: true,
    },
    Stamp,
  ))

  expect(
    file.filter((line) => line.startsWith("DT")),
  )
    .toEqual([
      "DTSTAMP:20261009T120000Z",
      "DTSTART;VALUE=DATE:20261013",
      "DTEND;VALUE=DATE:20261014",
    ])
})

test("the same event gets the same UID, so adding it again updates it", () => {
  const uid = (file: string) => lines(file).find((line) => line.startsWith("UID"))

  expect(
    uid(icsFile(Evening, Stamp)),
  )
    .toBe(uid(icsFile(Evening, new Date())))
})

test("a Google Calendar link carries the times, the place and the way back", () => {
  const url = new URL(googleCalendarUrl(Evening))

  expect(
    Object.fromEntries(url.searchParams),
  )
    .toEqual({
      action: "TEMPLATE",
      text: "Lisbon build night; demos, food",
      dates: "20261015T180000Z/20261015T210000Z",
      details:
        "Bring a laptop.\nAnd a friend.\n\nhttps://luma.com/lisbon-build-night",
      location: "Village Underground, Lisbon",
    })
})

test("a Google Calendar link for an all-day event gives dates", () => {
  const url = new URL(googleCalendarUrl({
    title: "Kickoff",
    start: new Date("2026-10-13T00:00:00Z"),
    end: new Date("2026-10-15T00:00:00Z"),
    allDay: true,
  }))

  expect(
    url.searchParams.get("dates"),
  )
    .toBe("20261013/20261015")
})

test("the file is named after the event", () => {
  expect(
    icsName(Evening),
  )
    .toBe("lisbon-build-night-demos-food.ics")
  expect(
    icsName({
      ...Evening,
      title: "🎉",
    }),
  )
    .toBe("event.ics")
})

test("an event that ends where it starts is written as an instant", () => {
  const instant = {
    title: "Office hours",
    start: new Date("2026-10-15T18:00:00Z"),
    end: new Date("2026-10-15T18:00:00Z"),
  }

  expect(
    lines(icsFile(instant, Stamp)).filter((line) => line.startsWith("DT")),
  )
    .toEqual([
      "DTSTAMP:20261009T120000Z",
      "DTSTART:20261015T180000Z",
    ])
  expect(
    new URL(googleCalendarUrl(instant)).searchParams.get("dates"),
  )
    .toBe("20261015T180000Z/20261015T180000Z")
})
