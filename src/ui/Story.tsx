/** @jsxImportSource preact */
import { type Chapter, Chapters } from "../story.ts"

/**
 * The Based House story as a timeline: one card per chapter down a brand
 * rail, each with its figures and the letters, decks and recaps it came
 * from. The hero button lands here. No apostrophes or quotes in prose here:
 * the class scanner pairs any quote with the next one of any kind.
 */
export function BasedHouseStory() {
  return (
    <section
      id="story"
      class="scroll-mt-8"
    >
      <div class="max-w-[640px] mx-auto text-center">
        <h2 class="text-4xl max-sm:text-3xl font-bold">
          The Based House story
        </h2>

        <p class="py-6 text-gray-600">
          How a letter to Jesse became a house for based builders and creators
          at every event that matters, and what we built between houses.
        </p>
      </div>

      <ol class="relative ml-3 pl-8 border-l-2 border-brand/20 flex flex-col gap-10 mt-4">
        {Chapters.map((chapter) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
          />
        ))}
      </ol>
    </section>
  )
}

function ChapterCard(props: { chapter: Chapter }) {
  const { chapter } = props
  const today = chapter.id === "today"

  return (
    <li
      id={`story-${chapter.id}`}
      class="relative"
    >
      <span
        aria-hidden="true"
        class={today
          ? "absolute -left-[43px] top-6 w-5 h-5 rounded-full bg-brand ring-4 ring-white animate-pulse"
          : "absolute -left-[43px] top-6 w-5 h-5 rounded-full bg-brand ring-4 ring-white"}
      />

      <article class="bg-white rounded-lg shadow-md border-[1px] border-gray-200 p-5 max-sm:p-4 flex flex-col gap-4">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span class="text-sm font-bold uppercase tracking-wide text-brand">
            {chapter.kicker}
          </span>

          <span class="text-sm text-gray-500">
            {chapter.when}
          </span>
        </div>

        <h3 class="text-2xl max-sm:text-xl font-bold leading-tight">
          {chapter.title}
        </h3>

        <div class="flex flex-col gap-3 text-gray-700">
          {chapter.paragraphs.map((paragraph, index) => (
            <p key={index}>
              {paragraph}
            </p>
          ))}
        </div>

        {chapter.stats && (
          <dl class="grid grid-cols-3 max-sm:grid-cols-2 gap-3 pt-1">
            {chapter.stats.map((stat) => (
              <div
                key={stat.label}
                class="rounded-lg bg-gray-50 border-[1px] border-gray-200 px-3 py-2"
              >
                <dd class="text-2xl font-bold leading-none text-brand">
                  {stat.value}
                </dd>
                <dt class="text-sm text-gray-500 mt-1">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        )}

        <div class="flex flex-wrap gap-2 pt-1">
          {chapter.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.href.startsWith("#") ? undefined : "_blank"}
              rel={link.href.startsWith("#") ? undefined : "noopener"}
              class={today
                ? "btn-brand text-sm"
                : "rounded-full border-[1px] border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"}
            >
              {link.label}
            </a>
          ))}
        </div>
      </article>
    </li>
  )
}
