import { expect, test } from "bun:test"
import * as NPath from "node:path"
import { Chapters, LetterToJesseV1Url, OpeningChapterId } from "./story.ts"

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

test("every chapter points at its sources, or is one", () => {
  expect(
    Chapters
      .filter((chapter) => chapter.links.length === 0 && !chapter.video)
      .map((chapter) => chapter.id),
  )
    .toEqual([])
})

test("the reel opens on the interview, one step before today", () => {
  expect(
    Chapters
      .slice(-2)
      .map((chapter) => [
        chapter.id,
        chapter.video !== undefined,
      ]),
  )
    .toEqual([
      [
        OpeningChapterId,
        true,
      ],
      [
        "today",
        false,
      ],
    ])
})

// The index ahead of the frames lets play start before the file has all
// arrived, and its running time is what the play button reads out.
test("the video plays as it loads and runs as long as it says", async () => {
  const video = Chapters
    .find((chapter) => chapter.id === OpeningChapterId)!
    .video!
  const file = Bun.file(NPath.join(import.meta.dir, "..", "public", video.src))
  const read = async (offset: number, length: number) =>
    new DataView(await file.slice(offset, offset + length).arrayBuffer())
  const type = (view: DataView, at: number) =>
    String.fromCharCode(...new Uint8Array(view.buffer, at, 4))
  const boxes: { type: string; offset: number }[] = []

  for (let offset = 0; offset < file.size;) {
    const head = await read(offset, 16)
    const size = head.getUint32(0)

    boxes.push({
      type: type(head, 4),
      offset,
    })

    if (size === 0) {
      break
    }

    offset += size === 1 ? Number(head.getBigUint64(8)) : size
  }

  const moov = boxes.find((box) => box.type === "moov")?.offset ?? 0
  const mvhd = await read(moov + 8, 40)
  const long = mvhd.getUint8(8) === 1
  const timescale = mvhd.getUint32(long ? 28 : 20)
  const duration = long ? Number(mvhd.getBigUint64(32)) : mvhd.getUint32(24)

  expect(
    {
      order: boxes
        .map((box) => box.type)
        .filter((box) => box === "moov" || box === "mdat"),
      header: type(mvhd, 4),
      seconds: Math.round(duration / timescale),
    },
  )
    .toEqual({
      order: [
        "moov",
        "mdat",
      ],
      header: "mvhd",
      seconds: video.seconds,
    })
})
