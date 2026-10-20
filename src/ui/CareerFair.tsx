/** @jsxImportSource preact */
import SamanthaOuyang from "../../assets/SamanthaOuyang.webp"
import { OutIcon } from "./Icons.tsx"
import { SectionHeading } from "./Layout.tsx"

export const CareerFairUrl = "https://www.dev3pack.xyz/programs/career-fair"

interface Speaker {
  name: string
  role: string
  bio: string
  /** A square photo; without one the card shows the speaker’s initials. */
  photo?: {
    src: string
    alt: string
  }
}

export const Speakers: Speaker[] = [
  {
    name: "Samantha Ouyang",
    role: "Main speaker",
    bio:
      "Samantha has been paving her own way in crypto and has an incredibly meaningful story to tell.",
    photo: {
      src: SamanthaOuyang,
      alt: "Samantha Ouyang at a gallery, standing before framed prints",
    },
  },
  {
    name: "Luciano DeAngelo",
    role: "Speaker",
    bio:
      "Luciano co-founded Homebase and has helped bring Based House residencies to Ethereum events from Denver to Buenos Aires.",
  },
]

/**
 * The Devcon career fair: a word on the fair, its speakers side by side, and
 * a link to its page. No apostrophes or quotes in prose here: the class
 * scanner pairs any quote with the next one of any kind.
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

      <ul class="grid gap-6 sm:grid-cols-2 w-full max-w-[840px] mx-auto">
        {Speakers.map((speaker) => (
          <SpeakerCard
            key={speaker.name}
            speaker={speaker}
          />
        ))}
      </ul>

      <div class="flex justify-center">
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
    </section>
  )
}

function SpeakerCard(props: { speaker: Speaker }) {
  const { speaker } = props
  const initials = speaker.name
    .split(" ")
    .map((word) => word[0])
    .join(String())

  return (
    <li class="bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col">
      {speaker.photo
        ? (
          <img
            src={speaker.photo.src}
            width={960}
            height={960}
            alt={speaker.photo.alt}
            loading="lazy"
            class="w-full aspect-square object-cover object-top"
          />
        )
        : (
          <div
            aria-hidden="true"
            class="w-full aspect-square flex items-center justify-center bg-brand text-white text-7xl font-bold"
          >
            {initials}
          </div>
        )}

      <div class="flex-1 p-6 max-sm:p-5 flex flex-col gap-3">
        <span class="text-sm font-bold uppercase tracking-wide text-brand">
          {speaker.role}
        </span>

        <h3 class="text-2xl font-bold leading-tight">
          {speaker.name}
        </h3>

        <p class="text-gray-700 leading-relaxed">
          {speaker.bio}
        </p>
      </div>
    </li>
  )
}
