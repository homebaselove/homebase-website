/** @jsxImportSource preact */
import { useRef } from "preact"
import { useSignal } from "preact/signals"
import { embedUrl, type Video, Videos, youtubeId } from "../videos.ts"
import { Dialog } from "./Dialog.tsx"
import { OutIcon, PlayIcon } from "./Icons.tsx"
import { SectionHeading } from "./Layout.tsx"

/** How many videos show before the reader asks for all of them. */
const FirstShown = 6

/** A thumbnail and its title, the face of every video in the grid. */
function Face(props: {
  readonly video: Video
  readonly external: boolean
}) {
  return (
    <>
      <div class="relative overflow-hidden rounded-xl bg-gray-100 shadow-md">
        <img
          loading="lazy"
          src={props.video.imageUrl}
          // An empty alt without an empty literal, which the class scanner
          // misreads: the title under the picture already names it.
          alt={String()}
          class="w-full aspect-video object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
        />

        <span class="absolute inset-0 flex items-center justify-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-brand shadow-md transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none">
            {props.external ? <OutIcon size={20} /> : <PlayIcon size={20} />}
          </span>
        </span>
      </div>

      <h3 class="mt-2 line-clamp-2 font-bold leading-snug group-hover:text-brand">
        {props.video.title}
      </h3>
    </>
  )
}

/**
 * Talks and build sessions from the houses. A YouTube video plays here, in a
 * dialog, through the privacy-enhanced player; a video posted elsewhere
 * opens where it was posted. The first few show at once, and the rest come
 * in on a press, with focus on the first of them, so nothing hidden is ever
 * in the way of the keyboard.
 */
export function VideoGallery() {
  const expanded = useSignal(false)
  const playing = useSignal<Video | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const shown = expanded.value ? Videos : Videos.slice(0, FirstShown)
  const playingId = playing.value && youtubeId(playing.value.url)

  return (
    <section
      id="videos"
      class="scroll-mt-8 flex flex-col gap-8"
    >
      <SectionHeading
        title="Videos"
        lead="Workshops, panels and build sessions from Homebase."
      />

      <ul
        ref={list}
        class="grid gap-x-4 gap-y-6 grid-cols-2 md:grid-cols-3"
      >
        {shown.map((video) => {
          const playsHere = youtubeId(video.url) !== null

          return (
            <li key={video.url}>
              {playsHere
                ? (
                  <button
                    type="button"
                    class="group block w-full text-left rounded-xl hb-focus"
                    onClick={() => {
                      playing.value = video
                    }}
                  >
                    <Face
                      video={video}
                      external={false}
                    />
                  </button>
                )
                : (
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="group block rounded-xl hb-focus"
                  >
                    <Face
                      video={video}
                      external
                    />
                  </a>
                )}
            </li>
          )
        })}
      </ul>

      {!expanded.value && Videos.length > FirstShown && (
        <button
          type="button"
          class="btn btn-quiet self-center"
          onClick={() => {
            expanded.value = true
            requestAnimationFrame(() => {
              list.current
                ?.children[FirstShown]
                ?.querySelector<HTMLElement>("button, a")
                ?.focus()
            })
          }}
        >
          See all {Videos.length} videos
        </button>
      )}

      {playing.value && playingId && (
        <Dialog
          title={playing.value.title}
          width={64}
          onClose={() => {
            playing.value = null
          }}
        >
          <div class="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={embedUrl(playingId)}
              title={playing.value.title}
              class="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </Dialog>
      )}
    </section>
  )
}
