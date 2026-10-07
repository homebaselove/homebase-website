/**
 * Which calendar feeds Homebase Live will read. The links are attested by
 * an admin, but the server fetches them, and the preview fetches whatever a
 * visitor pastes, so only the calendar hosts people actually use are
 * followed: Luma's, Google's and Outlook's, over https.
 */

export const AllowedHosts: readonly string[] = [
  "api.lu.ma",
  "api.luma.com",
  "lu.ma",
  "luma.com",
  "calendar.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
]

export type FeedLink =
  | {
    readonly kind: "ok"
    readonly url: string
  }
  | {
    readonly kind: "invalid"
    readonly message: string
  }

const MaxLength = 2048

/** The link as the server will fetch it: https, on an allowed host, no fragment. */
export function parseFeedLink(input: string): FeedLink {
  const text = input.trim().replace(/^webcals?:\/\//i, "https://")

  if (!text) {
    return {
      kind: "invalid",
      message: "Paste the calendar's iCal link.",
    }
  }

  if (text.length > MaxLength) {
    return {
      kind: "invalid",
      message: "That link is too long to be a calendar feed.",
    }
  }

  let url: URL

  try {
    url = new URL(text)
  } catch {
    return {
      kind: "invalid",
      message: "That doesn't look like a link.",
    }
  }

  if (url.protocol !== "https:") {
    return {
      kind: "invalid",
      message: "Calendar feeds are read over https only.",
    }
  }

  const host = url.hostname.toLowerCase()

  if (!AllowedHosts.includes(host)) {
    return {
      kind: "invalid",
      message:
        "Only Luma, Google Calendar and Outlook feeds are read. Paste the iCal link those offer.",
    }
  }

  url.hash = String()
  url.hostname = host

  return {
    kind: "ok",
    url: url.href,
  }
}
