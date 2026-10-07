/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import {
  type Chapter,
  Chapters,
  type CoverPhoto,
  OpeningChapterId,
  type StoryVideo,
} from "../story.ts"

const Opening = Math.max(
  0,
  Chapters.findIndex((chapter) => chapter.id === OpeningChapterId),
)

/**
 * The Based House story as a reel: the chapter in focus sits front and
 * center at full size, with the one behind and the one ahead peeking in at
 * a smaller scale. Scrolling, swiping, the dots and the arrow keys all move
 * the focus; off-center chapters are inert so focus never lands in a card
 * the reader cannot see. The reel opens on the interview rather than the
 * first letter, with the story so far one step back. From the sm breakpoint
 * up every card stands as tall as the tallest, so the reel reads as one band
 * whichever chapter is in focus; on a phone, where one card fills the
 * screen, each keeps its own height. No apostrophes or quotes in prose here:
 * the class scanner pairs any quote with the next one of any kind.
 */
export function BasedHouseStory() {
  const active = useSignal(Opening)
  const reel = useRef<HTMLOListElement>(null)

  const cards = () =>
    Array.from(
      reel.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? [],
    )

  const center = (index: number, behavior: ScrollBehavior) => {
    const scroller = reel.current
    const card = cards()[index]

    if (!scroller || !card) {
      return
    }

    scroller.scrollTo({
      left: card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2,
      behavior,
    })
  }

  const goTo = (index: number) => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

    center(index, reduced ? "auto" : "smooth")
  }

  // Before the first paint, so the reel is already on the opening chapter
  // when it shows and nobody sees it travel there.
  useLayoutEffect(() => {
    center(Opening, "instant")
  }, [])

  // The chapter whose center is nearest the center of the reel is the one in
  // focus, read on each scroll frame so swipes and the buttons agree.
  useEffect(() => {
    const scroller = reel.current

    if (!scroller) {
      return
    }

    let frame = 0

    const settle = () => {
      frame = 0

      const center = scroller.scrollLeft + scroller.clientWidth / 2
      let nearest = 0
      let distance = Infinity

      cards().forEach((card, index) => {
        const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)

        if (gap < distance) {
          distance = gap
          nearest = index
        }
      })

      active.value = nearest
    }

    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(settle)
      }
    }

    scroller.addEventListener("scroll", onScroll, {
      passive: true,
    })

    return () => {
      scroller.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const last = Chapters.length - 1

  return (
    <section
      id="story"
      class="scroll-mt-8 flex flex-col gap-6"
      role="region"
      aria-roledescription="carousel"
      aria-label="The Based House story"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault()
          goTo(Math.min(last, active.value + 1))
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          goTo(Math.max(0, active.value - 1))
        }
      }}
    >
      <div class="max-w-[640px] mx-auto text-center">
        <h2 class="text-4xl max-sm:text-3xl font-bold">
          Our Story
        </h2>

        <p class="mt-3 text-gray-600">
          From a letter to Jesse to Based House Mumbai.
        </p>
      </div>

      <div class="w-full max-w-[760px] mx-auto">
        <Rail
          active={active.value}
          goTo={goTo}
        />
      </div>

      <span
        aria-live="polite"
        class="sr-only"
      >
        Chapter {active.value + 1} of {Chapters.length}:{" "}
        {Chapters[active.value].title}
      </span>

      <ol
        ref={reel}
        tabIndex={0}
        class="story-reel relative flex items-start sm:items-stretch overflow-x-auto overscroll-x-contain snap-x snap-mandatory py-3 -my-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-xl"
      >
        <li
          aria-hidden="true"
          class="shrink-0"
          style="width: calc(50% - var(--story-card) / 2 - var(--story-gap))"
        />

        {Chapters.map((chapter, index) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            index={index}
            active={active.value}
            goTo={goTo}
          />
        ))}

        <li
          aria-hidden="true"
          class="shrink-0"
          style="width: calc(50% - var(--story-card) / 2 - var(--story-gap))"
        />
      </ol>
    </section>
  )
}

/**
 * The timeline itself: one dot per chapter on a rail that fills up to the
 * chapter in focus. Each dot is a button that moves the reel there.
 */
function Rail(props: { active: number; goTo: (index: number) => void }) {
  const count = Chapters.length
  const inset = `calc(100% / ${count} / 2)`
  const filled = count > 1 ? props.active / (count - 1) : 0

  return (
    <div class="relative flex-1 min-w-0 pt-3.5">
      <div
        aria-hidden="true"
        class="absolute top-[21px] h-0.5 bg-gray-200"
        style={`left: ${inset}; right: ${inset}`}
      />

      <div
        aria-hidden="true"
        class="absolute top-[21px] h-0.5 bg-brand transition-[width] duration-300 motion-reduce:transition-none"
        style={`left: ${inset}; width: calc((100% - ${inset} * 2) * ${filled})`}
      />

      <ol
        class="relative grid"
        style={`grid-template-columns: repeat(${count}, minmax(0, 1fr))`}
      >
        {Chapters.map((chapter, index) => {
          const reached = index <= props.active
          const focused = index === props.active

          return (
            <li
              key={chapter.id}
              class="flex flex-col items-center"
            >
              <button
                type="button"
                aria-label={`${chapter.when}: ${chapter.title}`}
                aria-current={focused ? "step" : undefined}
                class="group flex flex-col items-center gap-2 px-1 max-sm:px-0 w-full min-h-11 focus:outline-none"
                onClick={() => props.goTo(index)}
              >
                <span
                  class={focused
                    ? "block w-4 h-4 rounded-full bg-brand ring-4 ring-brand/20 transition-all duration-300 motion-reduce:transition-none"
                    : reached
                    ? "block w-4 h-4 rounded-full bg-brand ring-4 ring-white transition-all duration-300 motion-reduce:transition-none group-hover:ring-brand/20 group-focus-visible:ring-brand/20"
                    : "block w-4 h-4 rounded-full bg-white border-2 border-gray-300 ring-4 ring-white transition-all duration-300 motion-reduce:transition-none group-hover:border-brand group-focus-visible:border-brand"}
                />

                <span
                  class={focused
                    ? "max-sm:sr-only text-xs font-bold text-brand leading-tight text-center"
                    : "max-sm:sr-only text-xs text-gray-500 leading-tight text-center group-hover:text-brand"}
                >
                  {chapter.when}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ChapterCard(props: {
  chapter: Chapter
  index: number
  active: number
  goTo: (index: number) => void
}) {
  const { chapter } = props
  const focused = props.index === props.active
  const today = chapter.id === "today"
  // A neighbor shrinks from the edge nearest the focused card, so the sliver
  // the reader sees of it keeps its width whatever the scale.
  const side = props.index < props.active ? "origin-right" : "origin-left"

  return (
    <li
      data-chapter={chapter.id}
      role="group"
      aria-roledescription="slide"
      aria-label={`${props.index + 1} of ${Chapters.length}: ${chapter.title}`}
      class={focused
        ? "shrink-0 snap-center snap-always flex"
        : "shrink-0 snap-center snap-always flex cursor-pointer"}
      style="width: var(--story-card)"
      onClick={() => {
        if (!focused) {
          props.goTo(props.index)
        }
      }}
    >
      {
        /* The snap target above stays untransformed, so the reel centers on
          the layout box; the scale lives on this wrapper. */
      }
      <div
        class={focused
          ? "w-full flex transition-[transform,opacity] duration-300 motion-reduce:transition-none scale-100 opacity-100"
          : `w-full flex transition-[transform,opacity] duration-300 motion-reduce:transition-none scale-[0.92] sm:scale-[0.88] opacity-50 hover:opacity-75 ${side}`}
      >
        <article
          // Only the chapter in focus can be read or tabbed into.
          inert={!focused}
          class={chapter.video
            ? "w-full bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col sm:flex-row"
            : "w-full bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col"}
        >
          {chapter.video && (
            <Film
              video={chapter.video}
              focused={focused}
            />
          )}

          {chapter.cover && <Cover photos={chapter.cover} />}

          <div class="flex-1 p-6 max-sm:p-5 flex flex-col gap-4">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span class="text-sm font-bold uppercase tracking-wide text-brand">
                {chapter.kicker}
              </span>

              <span class="text-sm text-gray-500">
                {chapter.when}
              </span>
            </div>

            <h3 class="text-3xl max-sm:text-2xl font-bold leading-tight">
              {chapter.title}
            </h3>

            <details class="group -my-2">
              <summary class="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-gray-600 cursor-pointer select-none rounded-full -mx-2 px-2 transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                What happened
                <ChevronIcon />
              </summary>

              <div class="flex flex-col gap-4 pt-2 pb-2">
                <p class="text-gray-700 leading-relaxed">
                  {chapter.summary}
                </p>

                {chapter.stats && (
                  <dl class="grid grid-cols-2 sm:flex gap-3">
                    {chapter.stats.map((stat) => (
                      <div
                        key={stat.label}
                        class="sm:flex-1 sm:basis-0 max-sm:odd:last:col-span-2 max-[359px]:col-span-2 min-w-0 rounded-lg bg-gray-50 px-3 py-2.5"
                      >
                        <dd class="text-2xl max-sm:text-xl font-bold leading-none text-brand">
                          {stat.value}
                        </dd>
                        <dt class="text-sm text-gray-500 mt-1 break-words">
                          {stat.label}
                        </dt>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </details>

            {chapter.links.length > 0 && (
              <div class="flex flex-wrap gap-2 mt-auto pt-1">
                {chapter.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target={link.href.startsWith("#") ? undefined : "_blank"}
                    rel={link.href.startsWith("#") ? undefined : "noopener"}
                    class={today
                      ? "btn-brand text-sm min-h-11"
                      : "inline-flex items-center min-h-11 rounded-full border-[1px] border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>
    </li>
  )
}

/** How many times wider than tall the cover box is from the sm breakpoint up; client.css draws it. */
const CoverRatio = 1.3

/**
 * A video in place of the photos. It never plays by itself: it waits on its
 * poster, the last frame of its intro with the whole brand on it, and play
 * picks up from that frame. Until the reader presses play nothing loads and
 * the browser draws nothing over the poster, since its controls would put a
 * loading spinner or a play button across the logo; a button in the empty
 * blue below the brand starts it instead, and from then on the controls are
 * the ones the browser draws, full screen and volume among them. On a phone
 * the video stands at its own shape across the top of the card; from the sm
 * breakpoint up it takes the left of the card at the height every card
 * shares, on the blue of its own intro, with a floor under that height so it
 * stays big enough to watch whatever the other cards hold. It pauses when
 * its chapter leaves the focus.
 */
function Film(props: { video: StoryVideo; focused: boolean }) {
  const { video } = props
  const player = useRef<HTMLVideoElement>(null)
  const started = useSignal(false)

  useEffect(() => {
    if (!props.focused) {
      player.current?.pause()
    }
  }, [props.focused])

  const start = () => {
    const element = player.current

    if (!element) {
      return
    }

    started.value = true
    element.controls = true
    element.focus({
      preventScroll: true,
    })
    element.play()
  }

  return (
    <div class="story-film relative shrink-0 bg-brand sm:w-[46%] sm:min-h-[420px]">
      <video
        ref={player}
        src={`${video.src}#t=${video.start}`}
        poster={video.poster}
        width={video.width}
        height={video.height}
        controls={started.value}
        playsInline
        preload="none"
        aria-label={video.label}
        style={`aspect-ratio: ${video.width} / ${video.height}`}
        class="block w-full h-auto object-contain sm:absolute sm:inset-0 sm:h-full focus:outline-none"
      />

      {!started.value && (
        <button
          type="button"
          class="group absolute inset-0 cursor-pointer focus:outline-none"
          onClick={start}
        >
          <span class="absolute left-1/2 top-[78%] -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white min-h-11 px-5 text-base font-bold text-brand shadow-md transition-transform duration-150 group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-white/60 motion-reduce:transition-none">
            <PlayIcon />
            Watch · {Math.round(video.seconds / 60)} min
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * The photos on top of a card. From the sm breakpoint up every cover is the
 * same box, in the shape of the crew photos, so the cards line up: a photo
 * of that shape fills it, cropped a little at the edges around its middle
 * or the point it names; anything much wider sits whole in the box on a
 * blur of itself; a pair of posts sits centered on a near-black ground
 * that matches the dark posts themselves, and a post that names its own
 * ground sits whole on that.
 * Two photos share the width in proportion to their aspect ratios, so they
 * stand at one height with no margins between or beside them, unless both
 * are wide strips, which stack instead. On phones each cover keeps its own
 * height. Each photo opens its source.
 */
function Cover(props: { photos: CoverPhoto[] }) {
  const pair = props.photos.length > 1
  const stacked = pair
    && props.photos.every((photo) => photo.width / photo.height > 2)

  const ground = pair ? undefined : props.photos[0].ground

  return (
    <div
      class={stacked
        ? "story-cover story-pair story-pair-stack sm:justify-center"
        : pair
        ? "story-cover story-pair sm:items-center"
        : "story-cover"}
      style={ground ? `background: ${ground}` : undefined}
    >
      {props.photos.map((photo) => {
        const aspect = photo.width / photo.height
        // A photo much wider than the box is shown whole, as is a post on
        // its own ground; anything close to the shape of the box fills it.
        const whole = aspect > CoverRatio * 1.2 || photo.ground !== undefined
        const haloed = !pair && whole && photo.ground === undefined

        return (
          <a
            key={photo.src}
            href={photo.href}
            target="_blank"
            rel="noopener"
            style={pair ? `--aspect: ${aspect.toFixed(4)}` : undefined}
            class={pair
              ? "block min-w-0 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60"
              : "relative block min-w-0 sm:h-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60"}
          >
            {haloed && (
              <img
                src={photo.src}
                alt={String()}
                aria-hidden="true"
                draggable={false}
                class="hidden sm:block absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60 pointer-events-none"
              />
            )}

            <img
              src={photo.src}
              width={photo.width}
              height={photo.height}
              alt={photo.alt}
              loading="lazy"
              draggable={false}
              style={pair
                ? undefined
                : photo.focus === undefined
                ? `aspect-ratio: ${aspect.toFixed(4)}`
                : `aspect-ratio: ${
                  aspect.toFixed(4)
                }; object-position: 50% ${photo.focus}%`}
              class={pair
                ? "w-full h-auto"
                : whole
                ? "relative w-full sm:h-full sm:object-contain"
                : "relative w-full sm:h-full sm:object-cover"}
            />
          </a>
        )
      })}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
