import { describe, expect, test } from "bun:test"
import { parseFeedLink } from "./feeds.ts"

describe("parseFeedLink", () => {
  test("a Luma calendar feed is taken as it is, without a fragment", () => {
    expect(
      parseFeedLink(
        " https://api.lu.ma/ics/get?entity=calendar&id=cal-abc#x ",
      ),
    )
      .toEqual({
        kind: "ok",
        url: "https://api.lu.ma/ics/get?entity=calendar&id=cal-abc",
      })
  })

  test("webcal links become https", () => {
    expect(
      parseFeedLink(
        "webcal://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics",
      ),
    )
      .toEqual({
        kind: "ok",
        url:
          "https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics",
      })
  })

  test("plain http, unknown hosts and non-links are refused with a reason", () => {
    for (
      const input of [
        "http://api.lu.ma/ics/get?entity=calendar&id=cal-abc",
        "https://evil.example/feed.ics",
        "not a link",
        "",
      ]
    ) {
      expect(
        parseFeedLink(input).kind,
      )
        .toBe("invalid")
    }
  })
})
