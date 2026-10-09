/** The videos of past events and workshops, and how each one plays. */
import List from "./videos.json" with { type: "json" }

export interface Video {
  readonly title: string
  readonly imageUrl: string
  readonly url: string
}

export const Videos: readonly Video[] = List

/** The YouTube id in a watch, share or embed link; null for anywhere else. */
export function youtubeId(url: string): string | null {
  let link: URL

  try {
    link = new URL(url)
  } catch {
    return null
  }

  const host = link.hostname.replace(/^www\.|^m\./, "")

  if (host === "youtu.be") {
    return link.pathname.slice(1) || null
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
    return null
  }

  return link.searchParams.get("v")
    ?? link.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]
    ?? null
}

/**
 * The player for a YouTube video in the privacy-enhanced mode, which sets no
 * cookie until the video plays. It starts at once: the press that opened it
 * is the reader asking to watch.
 */
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
