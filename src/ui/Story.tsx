/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import { type Chapter, Chapters, type CoverPhoto } from "../story.ts"

/**
 * The Based House story as a reel: the chapter in focus sits front and
 * center at full size, with the one behind and the one ahead peeking in at
 * a smaller scale. Scrolling, swiping, the arrows, the dots and the keyboard
 * all move the focus; off-center chapters are inert so focus never lands in
 * a card the reader cannot see. No apostrophes or quotes in prose here: the
 * class scanner pairs any quote with the next one of any kind.
 */
export function BasedHouseStory() {
  const active = useSignal(0)
  const reel = useRef<HTMLOListElement>(null)

  const cards = () =>
    Array.from(
      reel.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? [],
    )

  const goTo = (index: number) => {
    const scroller = reel.current
    const card = cards()[index]

    if (!scroller || !card) {
      return
    }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

    scroller.scrollTo({
      left: card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2,
      behavior: reduced ? "auto" : "smooth",
    })
  }

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

      <div class="w-full max-w-[860px] mx-auto flex items-start gap-2">
        <ArrowButton
          direction="left"
          label="Previous chapter"
          disabled={active.value === 0}
          onClick={() => goTo(active.value - 1)}
        />

        <Rail
          active={active.value}
          goTo={goTo}
        />

        <ArrowButton
          direction="right"
          label="Next chapter"
          disabled={active.value === last}
          onClick={() => goTo(active.value + 1)}
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
        class="story-reel relative flex items-start overflow-x-auto overscroll-x-contain snap-x snap-mandatory py-3 -my-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-xl"
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

function ArrowButton(props: {
  direction: "left" | "right"
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      class="shrink-0 rounded-full border-[1px] p-3 transition-colors border-gray-200 text-gray-600 hover:border-brand/40 hover:bg-brand/10 hover:text-brand disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:hover:text-gray-600"
      onClick={props.onClick}
    >
      <ArrowIcon direction={props.direction} />
    </button>
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
          class="w-full bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col"
        >
          {chapter.cover && <Cover photos={chapter.cover} />}

          <div class="p-6 max-sm:p-5 flex flex-col gap-4">
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

              <p class="text-gray-700 leading-relaxed pt-2">
                {chapter.summary}
              </p>
            </details>

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

            <div class="flex flex-wrap gap-2 mt-auto pt-1">
              {chapter.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target={link.href.startsWith("#") ? undefined : "_blank"}
                  rel={link.href.startsWith("#") ? undefined : "noopener"}
                  class={today
                    ? "btn-brand text-sm min-h-11"
                    : "inline-flex items-center gap-1.5 min-h-11 rounded-full border-[1px] border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"}
                >
                  {link.label}
                  {!link.href.startsWith("#") && <OutwardIcon />}
                </a>
              ))}
            </div>
          </div>
        </article>
      </div>
    </li>
  )
}

/**
 * The photos on top of a card. One photo keeps its own shape up to a cap on
 * its height. Two share the width in proportion to their aspect ratios, so
 * they stand at one height with no margins between or beside them, unless
 * both are wide strips, which stack instead. Phones always stack. Each
 * photo opens its source.
 */
function Cover(props: { photos: CoverPhoto[] }) {
  const pair = props.photos.length > 1
  const stacked = pair
    && props.photos.every((photo) => photo.width / photo.height > 2)

  return (
    <div
      class={stacked
        ? "story-pair story-pair-stack bg-gray-100"
        : pair
        ? "story-pair bg-gray-100"
        : "bg-gray-100"}
    >
      {props.photos.map((photo) => (
        <a
          key={photo.src}
          href={photo.href}
          target="_blank"
          rel="noopener"
          style={pair
            ? `--aspect: ${(photo.width / photo.height).toFixed(4)}`
            : undefined}
          class="block min-w-0 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60"
        >
          <img
            src={photo.src}
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
            loading="lazy"
            draggable={false}
            style={pair
              ? undefined
              : `aspect-ratio: ${(photo.width / photo.height).toFixed(4)}`}
            class={pair
              ? "w-full h-auto"
              : "w-full object-cover sm:max-h-[360px]"}
          />
        </a>
      ))}
    </div>
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

function OutwardIcon() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function ArrowIcon(props: { direction: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {props.direction === "left"
        ? <path d="m15 18-6-6 6-6" />
        : <path d="m9 18 6-6-6-6" />}
    </svg>
  )
}
