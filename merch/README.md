# Shirts

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
