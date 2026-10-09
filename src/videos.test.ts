import { expect, test } from "bun:test"
import { embedUrl, Videos, youtubeId } from "./videos.ts"

test("YouTube links of every shape give their id", () => {
  expect(
    [
      "https://www.youtube.com/watch?v=0N7YhgHNfJg&t=30",
      "https://youtu.be/0N7YhgHNfJg?si=abc",
      "https://m.youtube.com/watch?v=0N7YhgHNfJg",
      "https://www.youtube.com/embed/0N7YhgHNfJg",
      "https://www.youtube.com/shorts/0N7YhgHNfJg",
    ]
      .map(youtubeId),
  )
    .toEqual([
      "0N7YhgHNfJg",
      "0N7YhgHNfJg",
      "0N7YhgHNfJg",
      "0N7YhgHNfJg",
      "0N7YhgHNfJg",
    ])
})

test("a video anywhere else has no YouTube id, and opens where it lives", () => {
  expect(
    [
      "https://x.com/lucianodeangeIo/status/1899183264759439586",
      "https://warpcast.com/nickcryptopro/0xa5f7208b",
      "not a link",
    ]
      .map(youtubeId),
  )
    .toEqual([
      null,
      null,
      null,
    ])
})

test("every listed video either plays here or links out", () => {
  expect(
    Videos.every((video) =>
      youtubeId(video.url) !== null || video.url.startsWith("https://")
    ),
  )
    .toBe(true)
})

test("the player is the privacy-enhanced one, and starts when opened", () => {
  expect(
    embedUrl("0N7YhgHNfJg"),
  )
    .toBe("https://www.youtube-nocookie.com/embed/0N7YhgHNfJg?autoplay=1&rel=0")
})
