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
      "https://www.youtube.com/watch?v=",
      "https://www.youtube.com/",
      "not a link",
    ]
      .map(youtubeId),
  )
    .toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
})

test("the list holds the videos the gallery shows: fourteen to play, two to open", () => {
  expect(
    Videos.map((video) =>
      youtubeId(video.url) ? "plays" : new URL(video.url).hostname
    ),
  )
    .toEqual([
      ...Array(14).fill("plays"),
      "x.com",
      "warpcast.com",
    ])
})

test("the player is the privacy-enhanced one, and starts when opened", () => {
  expect(
    embedUrl("0N7YhgHNfJg"),
  )
    .toBe("https://www.youtube-nocookie.com/embed/0N7YhgHNfJg?autoplay=1&rel=0")
})
