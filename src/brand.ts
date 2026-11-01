/**
 * The brand kit, at the address we give out: Vercel rewrites it to the deck
 * in public, and the Bun server serves the deck there too (`PublicRoute`).
 */
export const BrandKitUrl = "/brandkit"

/** The deck itself, in public like the ecosystem deck: `bun scripts/brand-kit.ts` writes it from the logo's dot maps. */
export const BrandKitFile = "/HomebaseBrandKit.pdf"

/** Every logo, icon and social image in the kit, for partners to download. */
export const BrandKitZipUrl = "/HomebaseBrandKit.zip"
