# Social images

What goes online: headline banners and the Based House Mumbai avatar for
Telegram, made from the brand kit (`brand/`). Every file is written by a
script in `scripts/`; edit the script, never the files. The kit's own social
images, the Homebase logo on blue, are in `brand/social/`.

## Headline banners

Welcome $home and Based House Mumbai, written by
`bun scripts/headline-banners.ts`, which also writes them at 3 × 6 ft to
`print/`. Each is a logo from the kit, white, top left, and its headline in
Lato Bold, centred on Homebase blue.

| File                         | Size        | Use it for                     |
| ---------------------------- | ----------- | ------------------------------ |
| `*-x-header-1500x500.png`    | 1500 × 500  | The header on X                |
| `*-og-1200x630.png`          | 1200 × 630  | A link preview, or a post      |
| `*-x-header-1500x500@2x.png` | 3000 × 1000 | Screens that show images at 2× |
| `*-og-1200x630@2x.png`       | 2400 × 1260 | Screens that show images at 2× |

The headline is centred on its ink, so neither its first letter's side
bearing nor the tracking after its last pulls it off the middle, with its
cap height on the middle line. The build stops if a headline would run past
the margins, into the logo's clear space (a fifth of its height), or, on the
X header, under the avatar X lays over the bottom left.

## Telegram avatar

The dot house over "Based House" and "Mumbai", centred, in Lato Bold,
Homebase blue on white. Written by `bun scripts/telegram-avatar.ts`.

| File                                   | What it is                              |
| -------------------------------------- | --------------------------------------- |
| `based-house-mumbai-telegram-1280.png` | 1280 × 1280 px: upload this one         |
| `based-house-mumbai-telegram.pdf`      | The vector master the PNG is drawn from |

Telegram shows an avatar as the circle inside the square, so the lockup is
sized to that circle: every dot and line sits within 84% of its radius.
Lato is set at 2.2 house dots, its capitals about a quarter of the house's
height, which keeps the house leading at chat-list size.

A larger PNG, up to 8192 px, comes from the PDF on request, so it cannot
drift from the vector:

```sh
pdftoppm -scale-to 8192 -png -singlefile social/based-house-mumbai-telegram.pdf based-house-mumbai-telegram-8192
```

## Building

```sh
bun scripts/headline-banners.ts
bun scripts/telegram-avatar.ts
```

They need Playwright's Chromium (set CHROMIUM_PATH when the local Playwright
has no browser of its own) and load Lato from Google Fonts, so they need the
network; the avatar needs pdftoppm (poppler) too.
