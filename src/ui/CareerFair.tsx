/** @jsxImportSource preact */
import SamanthaOuyang from "../../assets/SamanthaOuyang.webp"
import { OutIcon } from "./Icons.tsx"
import { SectionHeading } from "./Layout.tsx"

export const CareerFairUrl = "https://www.dev3pack.xyz/programs/career-fair"

/**
 * The Devcon career fair, with Samantha Ouyang as one of its main speakers:
 * her photo beside a short word on the fair and a link to its page. No
 * apostrophes or quotes in prose here: the class scanner pairs any quote
 * with the next one of any kind.
 */
export function CareerFair() {
  return (
    <section
      id="career-fair"
      class="scroll-mt-8 flex flex-col gap-8"
    >
      <SectionHeading
        kicker="Devcon"
        title="Career Fair"
        lead="This year’s career fair is focused on supporting women and students."
      />

      <article class="w-full max-w-[840px] mx-auto bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col sm:flex-row">
        <img
          src={SamanthaOuyang}
          width={960}
          height={960}
          alt="Samantha Ouyang at a gallery, standing before framed prints"
          loading="lazy"
          class="w-full sm:w-[42%] aspect-square sm:aspect-auto object-cover object-top shrink-0"
        />

        <div class="flex-1 p-6 max-sm:p-5 flex flex-col gap-4">
          <span class="text-sm font-bold uppercase tracking-wide text-brand">
            Main speaker
          </span>

          <h3 class="text-3xl max-sm:text-2xl font-bold leading-tight">
            Samantha Ouyang
          </h3>

          <p class="text-gray-700 leading-relaxed">
            Samantha has been paving her own way in crypto and has an
            incredibly meaningful story to tell.
          </p>

          <div class="flex flex-wrap gap-2 mt-auto pt-1">
            <a
              href={CareerFairUrl}
              target="_blank"
              rel="noopener"
              class="btn btn-brand btn-small min-h-11"
            >
              About the career fair
              <OutIcon size={14} />
            </a>
          </div>
        </div>
      </article>
    </section>
  )
}
