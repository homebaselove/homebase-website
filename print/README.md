# Print banners

Two 4 × 8 ft banners, hung landscape: SeedMe's and Homebase's. Both are
written by `bun scripts/banners.ts`; edit the script, never the files.

| File                       | What it is                                                 | Send it when                    |
| -------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `*-banner-4x8ft.pdf`       | 96 × 48 in, vector                                         | The printer takes a final-size PDF, as most do |
| `*-banner-4x8ft-bleed.pdf` | 97 × 49 in: 0.5 in of bleed a side, TrimBox at 96 × 48 in | The printer asks for bleed      |
| `*-banner-4x8ft.png`       | 14400 × 7200 px, 150 ppi at full size, sRGB                | The printer wants an image      |
| `*-banner-4x8ft.svg`       | The drawing the others are rendered from                   | Editing only                    |

- Nothing but the ground comes within 4 in of an edge, so hems, grommets and
  pole pockets up to 3 in deep stay clear of the artwork.
- Colour is RGB (sRGB): let the printer's RIP convert it for their inks, and
  ask for a proof. Homebase blue (`#0000FF`) and SeedMe blue (`#0052FF`) are
  brighter than CMYK can print and will come out a little deeper.
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
