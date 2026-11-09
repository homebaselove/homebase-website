/**
 * The address the QR code in the ecosystem deck gives out. Vercel redirects
 * it to the group, and the Bun server does too (`PublicRoute`), so the group
 * can move without the deck, or any copy of it already shared, changing.
 */
export const TelegramUrl = "/telegram"

/** What the QR code encodes: that address on the site. */
export const TelegramQrUrl = `https://homebase.love${TelegramUrl}`

/** The group the address leads to. `vercel.json` names it too. */
export const TelegramGroupUrl = "https://t.me/HomebaseHomies"
