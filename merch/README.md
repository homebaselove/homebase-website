# Merch

Shirts, the Based House Mumbai Telegram avatar, Homebase banners and logo
posters.

## Shirts

Two tees: Based House Mumbai for Devcon 2026, and SeedMe.

| Shirt       | Front                                    | Back                                                                            |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Based House | The dot house, white, on the left chest  | BASED HOUSE / MUMBAI over the left shoulder blade, DEVCON / 2026 over the right |
| SeedMe      | The seedme wordmark, white, on the chest | The SeedMe egg, nothing else                                                    |

The Based House shirt is printed on a royal blue blank (`#1d46a4`, sampled
from the blank’s product photo; Homebase blue `#0000ff` is brighter than
cotton can be dyed) with white ink. The SeedMe shirt is black with white ink
and the egg in full colour.

`mockups/` has each side lit at 120 px per inch (3600 × 4200), plus
`based-house.jpg` and `seedme.jpg` with front and back side by side.

## Print files

Everything in `print/` is at actual size: the SVGs carry their size in
inches, and the PNGs are 300 DPI on a transparent ground. Placements are for
a men’s large, measured from the high point of the shoulder (HPS) and the
centre line. “Left” is the wearer’s left.

| File                | Size (in)    | Placement                                                                              |
| ------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `based-house-front` | 3.00 × 3.00  | Left chest: centre 3.6 left of the centre line, top 5.6 below HPS                      |
| `based-house-back`  | 12.00 × 1.28 | Across the shoulder blades, centred, top edge 4 below the back neck seam               |
| `seedme-front`      | 3.25 × 0.68  | Left chest: centre 3.6 left of the centre line and 7.1 below HPS, level with the house |
| `seedme-back.png`   | 5.75 × 9.07  | Upper back, centred, top 4.25 below HPS. Full colour; needs a white underbase on black |

Send `print/based-house-back-placement.jpg` to the printer with the back
file: it shows the print on the shirt with every measurement.

### Why the back print sits where it does

Over the shoulders, lettering rides the slope of the shoulder, and that
slope differs from one wearer to the next, so the same print lands
differently on each. The shoulder blades are the flattest, steadiest part of
the upper back. They run from about the second to the seventh thoracic
vertebra, with their inner edge about 2 in from the spine, which puts their
middle 4 to 5 in below the collar. Print shops start an upper-back print 3
to 4 in below the collar ([Vistaprint][vistaprint], [4OVER4][4over4]), or 4
in ([ScreenPrinting.com][screenprinting], [Gelato][gelato]). So the top edge
of the lettering is 4 in below the back neck seam at centre back, and the
band is centred about 4.6 in down, on the blades. Each block keeps to 6 in
from the centre line, off the curve toward the armholes. That makes the
whole print 12 in wide, which fits a standard platen in one pass. Use the
same measurement on every size.

[vistaprint]: https://www.vistaprint.com/hub/t-shirt-design-placement-guide
[4over4]: https://v2.4over4.com/guide/t-shirt-print-size-guide-how-big-should-your-design-be
[screenprinting]: https://screenprinting.com/blogs/news/t-shirt-design-placement-guide-your-easy-reference-for-industry-standard-layouts
[gelato]: https://www.gelato.com/blog/t-shirt-design-placement-guide

The lettering is a 5 × 7 dot-matrix face drawn for these shirts
(`lettering.ts`). It shares the house’s grid: a line stands seven dots tall,
as the house does, and the dots keep the house’s size to spacing.

## Telegram avatar

`telegram/` holds the Based House Mumbai avatar: the dot house over BASED
HOUSE / MUMBAI in the shirt lettering, centred, in Homebase blue (`#0000ff`,
the logo’s blue) on white.

| File                          | Use                                  |
| ----------------------------- | ------------------------------------ |
| `based-house-mumbai-1280.png` | Upload this one to Telegram          |
| `based-house-mumbai-8192.png` | The largest render                   |
| `based-house-mumbai.svg`      | The vector master, sharp at any size |

Telegram shows an avatar as the circle inside the square, so the lockup is
sized to that circle: every dot sits within 84% of its radius. The lockup is
centred on its box and raised 2.5% of its height, since a mark centred
exactly looks low. The house dots stand five lettering dots apart, which
keeps the house clear at chat-list size, where no lettering can be read.

## Banners

`banners/` holds two banners in the brand kit’s social sizes, each at 1× and
2×: the X header (1500 × 500) and the link preview (1200 × 630). `banners/print`
holds both for print at 3 × 6 ft.

| File                   | Logo, top left           | Headline           |
| ---------------------- | ------------------------ | ------------------ |
| `welcome-home-*`       | The house mark alone     | Welcome $home      |
| `based-house-mumbai-*` | The full horizontal logo | Based House Mumbai |

They follow the brand kit (homebase.love/brandkit): the kit’s logo files,
white on Homebase Blue, top left with far more than their clear space; the
headline in Lato Bold at the kit’s display setting, centred; `$home` in
lowercase. Nothing is set in dots. Based House Mumbai carries the horizontal
logo, the lockup the kit names for banners. Welcome $home carries the house
mark alone, a third taller than the house in the horizontal logo, so it holds
the corner without the wordmark. The logo files are read from
`brand/logo/svg`, so a change to the kit carries over on the next build.

The headline is centred on its ink, so the side bearing of its first letter
and the tracking after its last do not pull it off the middle, with its cap
height on the middle line. The build stops if a headline would run past the
margins, into the logo’s clear space, or, on the X header, under the avatar
X lays over the bottom left.

### Printing the banners at 3 × 6 ft

| File                         | What it is                                                   |
| ---------------------------- | ------------------------------------------------------------ |
| `*-72x36in.pdf`              | Vector, 72 × 36 in, Lato embedded: send this                 |
| `*-72x36in-bleed.pdf`        | The same with 0.5 in of blue past every edge, 73 × 37 in     |
| `*-72x36in-300dpi.png`       | 21600 × 10800 px, rasterised from the PDF, if a PNG is asked |
| `*-72x36in-bleed-300dpi.png` | 21900 × 11100 px, the bleed version as PNG                   |

The PDFs hold the dots and the type as vectors, with no images inside, so
they print sharp at any size. Send the bleed version if the shop asks for
bleed, the exact size otherwise. Logo and headline stay more than 4 in from
the edge, clear of hems and grommets. `#0000FF` is brighter than CMYK can
print: the kit’s starting points are CMYK 100 88 0 0 or Pantone Blue 072 C,
so ask the shop for a proof.

## Posters

`poster/` holds two posters of the Homebase logo, white on Homebase Blue,
centred across and raised 3% of the sheet’s height above the middle, since a
mark centred exactly looks low.

| Poster                   | Logo                              | Width of the sheet | Sizes          |
| ------------------------ | --------------------------------- | ------------------ | -------------- |
| `homebase-poster-*`      | The kit’s stacked lockup          | 70%                | 11 × 17 in, A3 |
| `homebase-mark-poster-*` | The house mark alone, no wordmark | 55%                | A3, A4         |

11 × 17 in (tabloid) is the standard small poster for US print shops, the
step up from letter; A3 (297 × 420 mm) is the step up from A4 elsewhere. Each
size comes as a vector PDF at size (send this), the same with bleed (⅛ in, or
3 mm on A sizes), and a 300 DPI PNG of each rasterised from its PDF.

The PDFs are pure vector, with no images or fonts. Chromium rounds a page to
its print grid, so A sizes come out up to 0.2 mm over, blue past the edge,
well inside a print shop’s trim. Colour as for the banners: ask for a proof
against CMYK 100 88 0 0 or Pantone Blue 072 C.

```sh
bun merch/poster.ts
```

## Sources

- The house is `House` from `src/ui/dots.ts`, the same map the site draws.
- `source/seedme-wordmark.svg` is “seedme” in Inter Display Bold (SIL Open
  Font License), tracked −0.015 em and outlined, to match the type on the
  reference shirt. seedme.xyz was not reachable when this was made; if SeedMe
  has its own wordmark, drop its outlines into that file.
- `source/seedme-egg.jpg` is the supplied egg render. `egg.ts` traces its
  outline, fits it with a smooth curve, denoises the shading, scales it to
  print size and puts fresh grain on it.

## Building

```sh
bun merch/build.ts
```

It needs Playwright’s Chromium (`bunx playwright install chromium`). The
shirt is drawn as flat layers in `shirt.ts` and lit in `light.ts`; output is
the same on every run.

The banners build on their own, since Lato comes from Google Fonts and needs
the network:

```sh
bun merch/banners.ts
```
