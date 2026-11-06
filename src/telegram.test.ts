import { expect, test } from "bun:test"
import jsQR from "jsqr"
import * as NPath from "node:path"
import * as NZlib from "node:zlib"
import VercelConfig from "../vercel.json" with { type: "json" }
import { SustainableEcosystemUrl } from "./funding.ts"
import { TelegramGroupUrl, TelegramQrUrl, TelegramUrl } from "./telegram.ts"

const Deck = NPath.join(
  import.meta.dir,
  "..",
  "public",
  SustainableEcosystemUrl,
)

/**
 * The QR codes in a deck exported as one picture per slide. Flat slides, the
 * one with the code among them, are stored lossless (Flate) and read here;
 * photo slides are JPEG and skipped.
 */
const qrCodesIn = (pdf: Uint8Array) => {
  const text = new TextDecoder("latin1").decode(pdf)
  const codes: Array<string> = []

  for (
    const image of text.matchAll(
      /<<([^<>]*\/Subtype \/Image[^<>]*)>>\s*stream\r?\n/g,
    )
  ) {
    const dictionary = image[1]
    if (
      !dictionary.includes("/FlateDecode")
      || dictionary.includes("/DecodeParms")
    ) {
      continue
    }

    const width = Number(/\/Width (\d+)/.exec(dictionary)?.[1])
    const height = Number(/\/Height (\d+)/.exec(dictionary)?.[1])
    const start = image.index + image[0].length
    const rgb = NZlib.inflateSync(
      pdf.subarray(start, text.indexOf("endstream", start)),
    )
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let from = 0, to = 0; from < rgb.length; from += 3, to += 4) {
      rgba[to] = rgb[from]
      rgba[to + 1] = rgb[from + 1]
      rgba[to + 2] = rgb[from + 2]
    }

    const code = jsQR(rgba, width, height, {
      inversionAttempts: "dontInvert",
    })
    if (code) {
      codes.push(code.data)
    }
  }

  return codes
}

// Browsers cache a permanent redirect, so this one stays temporary: when the group moves, codes already shared follow it.
test("Vercel sends the address the QR code gives out to the Telegram group", () => {
  expect(
    VercelConfig.redirects,
  )
    .toContainEqual({
      source: TelegramUrl,
      destination: TelegramGroupUrl,
      permanent: false,
    })
})

// Each slide is a picture, so only decoding the code shows where it leads. The first deck carried a screenshot of a Telegram login code instead.
// Reading the slides at full size takes a couple of seconds, and names whatever a wrong code holds.
test(
  "the QR code in the ecosystem deck leads to the Telegram address",
  async () => {
    expect(
      qrCodesIn(await Bun.file(Deck).bytes()),
    )
      .toEqual([
        TelegramQrUrl,
      ])
  },
  30_000,
)
