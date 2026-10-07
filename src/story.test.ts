import { expect, test } from "bun:test"
import { Chapters, LetterToJesseV1Url } from "./story.ts"

test("chapters run in order from the first letter to today", () => {
  expect(
    Chapters.map((chapter) => chapter.month),
  )
    .toEqual([
      ...Chapters.map((chapter) => chapter.month),
    ]
      .sort())
})

test("each chapter has its own id", () => {
  expect(
    new Set(Chapters.map((chapter) => chapter.id)).size,
  )
    .toBe(Chapters.length)
})

test("every link is either on the web or on this page", () => {
  expect(
    Chapters
      .flatMap((chapter) => [
        ...chapter.links,
        ...(chapter.cover ?? []),
      ])
      .map((link) => link.href)
      .filter((href) => !/^(https:\/\/|#)/.test(href)),
  )
    .toEqual([])
})

test("a cover holds at most two photos, each sized and described", () => {
  expect(
    Chapters
      .filter((chapter) => chapter.cover)
      .map((chapter) => [
        chapter.id,
        chapter.cover!.length <= 2,
        chapter.cover!.every((photo) =>
          photo.src.length > 0
          && photo.alt.length > 0
          && photo.width > 0
          && photo.height > 0
        ),
      ]),
  )
    .toEqual([
      [
        "inception",
        true,
        true,
      ],
      [
        "ethdenver-2025",
        true,
        true,
      ],
      [
        "base-batches",
        true,
        true,
      ],
      [
        "letter-v2",
        true,
        true,
      ],
      [
        "devconnect-2025",
        true,
        true,
      ],
      [
        "ethdenver-2026",
        true,
        true,
      ],
      [
        "today",
        true,
        true,
      ],
    ])
})

test("the story opens with the letter the house started from", () => {
  expect(
    Chapters[0].links[0],
  )
    .toEqual({
      label: "Letter to Jesse V1",
      href: LetterToJesseV1Url,
    })
})

test("every chapter points at its sources", () => {
  expect(
    Chapters
      .filter((chapter) => chapter.links.length === 0)
      .map((chapter) => chapter.id),
  )
    .toEqual([])
})
