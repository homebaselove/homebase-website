# Print files

What goes to a printer: banners and posters. Every file is written by a
script in `scripts/`; edit the script, never the files. The PDFs are at
actual size, and each `-bleed.pdf` has its TrimBox on the trim, so the
printer's RIP knows where to cut.

## 4 × 8 ft banners

Two banners, hung landscape: SeedMe's and Homebase's. Both are written by
`bun scripts/banners.ts`.

| File                       | What it is                                                | Send it when                                   |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `*-banner-4x8ft.pdf`       | 96 × 48 in, vector                                        | The printer takes a final-size PDF, as most do |
| `*-banner-4x8ft-bleed.pdf` | 97 × 49 in: 0.5 in of bleed a side, TrimBox at 96 × 48 in | The printer asks for bleed                     |
| `*-banner-4x8ft.png`       | 14400 × 7200 px, 150 ppi at full size, sRGB               | The printer wants an image                     |
| `*-banner-4x8ft.svg`       | The drawing the others are rendered from                  | Editing only                                   |

- Nothing but the ground comes within 4 in of an edge, so hems, grommets and
  pole pockets up to 3 in deep stay clear of the artwork.
- There are no fonts: every letter is outlines. Homebase's PDFs are all
  vector; the only images in SeedMe's are the soft inner shadows on its two
  seeds, at 300 ppi.
- Both logos stand a third taller than the capitals of their names:
  SeedMe's seed 13.75 in beside a 10.3 in seedme, and Homebase's house
  9.58 in beside 7.19 in letters.
- Each QR code opens its own brand's site, drawn in that brand's style:
  https://seedme.xyz on SeedMe's banner, https://homebase.love on Homebase's.
  Both decode from these files with zxing-cpp and OpenCV. Scan the printed
  proof with an iPhone and an Android phone before the full run.

## 3 × 6 ft headline banners

Welcome $home and Based House Mumbai, hung landscape, written by
`bun scripts/headline-banners.ts` with their social sizes in `social/`. Each
is a logo from the brand kit, white, top left, and its headline in Lato Bold,
centred on Homebase blue. Based House Mumbai carries the horizontal logo,
the lockup the kit names for banners; Welcome $home carries the house alone,
a third taller than in that logo, so it holds the corner without the
wordmark.

| File                       | What it is                                                | Send it when                                   |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `*-banner-3x6ft.pdf`       | 72 × 36 in, vector                                        | The printer takes a final-size PDF, as most do |
| `*-banner-3x6ft-bleed.pdf` | 73 × 37 in: 0.5 in of bleed a side, TrimBox at 72 × 36 in | The printer asks for bleed                     |

- Logo and headline stay more than 4.6 in from every edge, clear of hems and
  grommets.
- The headline is Lato Bold, embedded in the PDF, so the printer needs no
  fonts.

## Posters

The brand kit's logos, white, centred across on Homebase blue and raised 3%
of the sheet's height above the middle, since a mark centred exactly looks
low. Written by `bun scripts/posters.ts`; there is no text to embed.

| File                         | Logo                         | Logo width       | Sizes          |
| ---------------------------- | ---------------------------- | ---------------- | -------------- |
| `homebase-poster-*.pdf`      | The kit's stacked lockup     | 70% of the sheet | 11 × 17 in, A3 |
| `homebase-mark-poster-*.pdf` | The house alone, no wordmark | 55% of the sheet | A3, A4         |

11 × 17 in (tabloid) is the standard small poster at US print shops, the step
up from letter; A3 is the step up from A4 everywhere else. Each size comes as
a final-size PDF and as `-bleed.pdf`, with the bleed shops ask for: ⅛ in on
11 × 17 in, 3 mm on A sizes.

Chromium rounds a page up to its print grid, so the A sizes come out up to
0.4 mm over, at the bottom and right, in blue: well inside a shop's trim. The
TrimBox of each A size `-bleed.pdf` sits exactly on the A size.

## Colour

Everything here is RGB (sRGB): let the printer's RIP convert it for their
inks, and ask for a proof. Homebase blue (`#0000FF`) and SeedMe blue
(`#0052FF`) are brighter than CMYK can print and will come out a little
deeper. The brand kit's starting points for Homebase blue are CMYK
100 88 0 0 and Pantone Blue 072 C.

## An image instead of a PDF

The headline banners and the posters are kept as PDF only. When a printer
wants an image, render it from the PDF, so it cannot drift from the vector:

```sh
pdftoppm -r 150 -png -singlefile print/welcome-home-banner-3x6ft.pdf welcome-home-banner-3x6ft
pdftoppm -r 300 -png -singlefile print/homebase-poster-a3.pdf homebase-poster-a3
```

150 ppi is what large-format printers ask for at a banner's viewing distance;
300 ppi suits a poster read up close. pdftoppm comes with poppler, and its
PNGs carry their resolution, so the RIP reads them at full size.

## Building

```sh
bun scripts/headline-banners.ts
bun scripts/posters.ts
```

Every PDF they write carries a fixed date in place of the time it was
printed, so rebuilding an unchanged design writes the same bytes. They need
Playwright's Chromium (set CHROMIUM_PATH when the local Playwright has no
browser of its own), and the headline banners load Lato from Google Fonts,
so they need the network.
