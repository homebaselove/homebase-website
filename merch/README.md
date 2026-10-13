# Shirts

Two tees: Based House Mumbai for Devcon 2026, and SeedMe.

| Shirt       | Front                                    | Back                                                                    |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Based House | The dot house, white, on the left chest  | BASED HOUSE / MUMBAI over the left shoulder, DEVCON / 2026 on the right |
| SeedMe      | The seedme wordmark, white, on the chest | The SeedMe egg, nothing else                                            |

The Based House shirt is Homebase blue (`#0000ff`, the site’s
`--color-brand`) with white ink. The SeedMe shirt is black with white ink and
the egg in full colour.

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
| `based-house-back`  | 13.80 × 1.28 | Upper back, centred, top 2.6 below HPS. Each block sits 6.9 out from the centre line   |
| `seedme-front`      | 3.25 × 0.68  | Left chest: centre 3.6 left of the centre line and 7.1 below HPS, level with the house |
| `seedme-back.png`   | 5.75 × 9.07  | Upper back, centred, top 4.25 below HPS. Full colour; needs a white underbase on black |

The back of the Based House shirt is one file so the two blocks keep their
spacing. If the printer’s platen is narrower than 14 in, ask them to print
it as two placements at the same height.

The lettering is a 5 × 7 dot-matrix face drawn for these shirts
(`lettering.ts`). It shares the house’s grid: a line stands seven dots tall,
as the house does, and the dots keep the house’s size to spacing.

`#0000ff` is brighter than any dyed cotton gets. Pick the nearest stock
blank (a true royal, around Pantone Blue 072 C) and approve a physical
swatch before the run.

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
