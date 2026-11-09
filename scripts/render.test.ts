import { expect, test } from "bun:test"
import { trimBoxed } from "./render.ts"

/**
 * A one-page PDF laid out as Chromium writes one, 3 × 2 in unless Chromium
 * rounded the page up to `media`, in points.
 */
function chromiumPdf(media = "216 144") {
  const objects = [
    "<</Title (Test)>>",
    `<</Type /Page\n/Resources <</ProcSet [/PDF]>>\n/MediaBox [0 0 ${media}]\n/Parent 3 0 R>>`,
    "<</Type /Pages\n/Count 1\n/Kids [2 0 R]>>",
    "<</Type /Catalog\n/Pages 3 0 R>>",
  ]
  let text = "%PDF-1.4\n"
  const offsets = objects.map((object, index) => {
    const offset = text.length
    text += `${index + 1} 0 obj\n${object}\nendobj\n`

    return offset
  })
  const xref = text.length
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("")
    + `trailer\n<</Size ${objects.length + 1}\n/Root 4 0 R\n/Info 1 0 R>>\n`
    + `startxref\n${xref}\n%%EOF\n`

  return {
    pdf: Buffer.from(text, "latin1"),
    xref,
  }
}

test("TrimBox sits at the trim and BleedBox at the page, in points", () => {
  const { pdf } = chromiumPdf()
  const update = trimBoxed(pdf, 0.25, 2.5, 1.5)
    .subarray(pdf.length)
    .toString("latin1")

  expect(
    update,
  )
    .toStartWith(
      "2 0 obj\n<</Type /Page\n/Resources <</ProcSet [/PDF]>>\n/MediaBox [0 0 216 144]\n/Parent 3 0 R\n/TrimBox [18 18 198 126]\n/BleedBox [0 0 216 144]>>\nendobj\n",
    )
})

test("on a page Chromium rounded up, both boxes are measured from its top, where the art starts", () => {
  const { pdf } = chromiumPdf("217.02 144.36")
  const update = trimBoxed(pdf, 0.25, 2.5, 1.5)
    .subarray(pdf.length)
    .toString("latin1")

  expect(
    update,
  )
    .toContain(
      "/MediaBox [0 0 217.02 144.36]\n/Parent 3 0 R\n/TrimBox [18 18.36 198 126.36]\n/BleedBox [0 0.36 216 144.36]>>",
    )
})

test("the update leaves the original bytes and chains to their xref", () => {
  const { pdf, xref } = chromiumPdf()
  const out = trimBoxed(pdf, 0.25, 2.5, 1.5)
  const text = out.toString("latin1")
  const update = text.slice(pdf.length)
  const [, entry] = /xref\n2 1\n(\d{10}) 00000 n \n/.exec(update)!
  const [, start] = /startxref\n(\d+)\n%%EOF\n$/.exec(update)!

  expect(
    out.subarray(0, pdf.length),
  )
    .toEqual(pdf)

  expect(
    text.indexOf("2 0 obj", Number(entry)),
  )
    .toBe(Number(entry))

  expect(
    Number(entry),
  )
    .toBe(pdf.length)

  expect(
    text.startsWith("xref\n2 1\n", Number(start)),
  )
    .toBe(true)

  expect(
    update,
  )
    .toContain(`/Root 4 0 R\n/Info 1 0 R\n/Prev ${xref}>>`)
})

test("a PDF that already has a TrimBox is refused", () => {
  const { pdf } = chromiumPdf()

  expect(
    () => trimBoxed(trimBoxed(pdf, 0.25, 2.5, 1.5), 0.25, 2.5, 1.5),
  )
    .toThrow("not laid out as expected")
})
