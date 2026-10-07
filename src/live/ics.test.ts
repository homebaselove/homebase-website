import { describe, expect, test } from "bun:test"
import { FeedError, parseFeed } from "./ics.ts"

const Now = new Date("2026-11-01T12:00:00Z")

const Feed = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Luma//EN",
  "X-WR-CALNAME:Homebase Live",
  "BEGIN:VEVENT",
  "UID:past@luma",
  "DTSTART:20260901T180000Z",
  "DTEND:20260901T190000Z",
  "SUMMARY:Already happened",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:single@luma",
  "DTSTART:20261110T180000Z",
  "DTEND:20261110T190000Z",
  "SUMMARY:Builder hour",
  "DESCRIPTION:Join at https://lu.ma/builder-hour for the link.",
  "URL:https://lu.ma/builder-hour",
  "LOCATION:https://youtube.com/live/abc",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:allday@luma",
  "DTSTART;VALUE=DATE:20261115",
  "DTEND;VALUE=DATE:20261116",
  "SUMMARY:Open house",
  "LOCATION:https://stream.example/open",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@luma",
  "DTSTART:20261105T170000Z",
  "DTEND:20261105T180000Z",
  "RRULE:FREQ=WEEKLY;COUNT=4",
  "EXDATE:20261119T170000Z",
  "SUMMARY:Weekly stand-up",
  "DESCRIPTION:Watch at https://twitch.tv/homebase",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@luma",
  "RECURRENCE-ID:20261112T170000Z",
  "DTSTART:20261112T190000Z",
  "DTEND:20261112T200000Z",
  "SUMMARY:Weekly stand-up (moved)",
  "END:VEVENT",
  "END:VCALENDAR",
]
  .join("\r\n")

describe("parseFeed", () => {
  const feed = parseFeed(Feed, {
    now: Now,
  })

  test("the calendar's name comes along", () => {
    expect(
      feed.name,
    )
      .toBe("Homebase Live")
  })

  test("what has passed is left out, and the rest is in order of start", () => {
    expect(
      feed.events.map((event) => [
        event.id,
        event.title,
        event.start,
      ]),
    )
      .toEqual([
        [
          "weekly@luma@2026-11-05T17:00:00.000Z",
          "Weekly stand-up",
          "2026-11-05T17:00:00.000Z",
        ],
        [
          "single@luma",
          "Builder hour",
          "2026-11-10T18:00:00.000Z",
        ],
        [
          "weekly@luma@2026-11-12T19:00:00.000Z",
          "Weekly stand-up (moved)",
          "2026-11-12T19:00:00.000Z",
        ],
        [
          "allday@luma",
          "Open house",
          new Date(2026, 10, 15).toISOString(),
        ],
        [
          "weekly@luma@2026-11-26T17:00:00.000Z",
          "Weekly stand-up",
          "2026-11-26T17:00:00.000Z",
        ],
      ])
  })

  test("the link is the URL field, else a link in the location, else one in the description", () => {
    const linkOf = (id: string) =>
      feed.events.find((event) => event.id === id)?.link

    expect(
      linkOf("single@luma"),
    )
      .toBe("https://lu.ma/builder-hour")
    expect(
      linkOf("allday@luma"),
    )
      .toBe("https://stream.example/open")
    expect(
      linkOf("weekly@luma@2026-11-05T17:00:00.000Z"),
    )
      .toBe("https://twitch.tv/homebase")
  })

  test("an all-day event says so", () => {
    expect(
      feed.events.find((event) => event.id === "allday@luma")?.allDay,
    )
      .toBe(true)
    expect(
      feed.events.find((event) => event.id === "single@luma")?.allDay,
    )
      .toBe(false)
  })

  test("the horizon and the limit cap the list", () => {
    expect(
      parseFeed(Feed, {
        now: Now,
        horizonDays: 7,
      })
        .events
        .map((event) => event.id),
    )
      .toEqual([
        "weekly@luma@2026-11-05T17:00:00.000Z",
      ])
    expect(
      parseFeed(Feed, {
        now: Now,
        limit: 2,
      })
        .events
        .length,
    )
      .toBe(2)
  })

  test("text that is not a calendar is refused by name", () => {
    expect(
      () =>
        parseFeed("<html>not a calendar</html>", {
          now: Now,
        }),
    )
      .toThrow(FeedError)
  })
})
