/** @jsxImportSource preact */
import LucianoDeAngelo from "../../assets/LucianoDeAngelo.webp"
import SamanthaOuyang from "../../assets/SamanthaOuyang.webp"
import SoleneDaviaud from "../../assets/SoleneDaviaud.webp"
import { OutIcon } from "./Icons.tsx"
import { SectionHeading } from "./Layout.tsx"

const CareerFairUrl = "https://www.dev3pack.xyz/programs/career-fair"

interface Speaker {
  name: string
  role: string
  bio?: string
  /** A square photo. */
  photo: {
    src: string
    alt: string
  }
}

const Speakers: Speaker[] = [
  {
    name: "Samantha Ouyang",
    role: "Main speaker",
    bio:
      "Samantha entered crypto at just 15. Now 22, she has spent seven years building, researching, and investing in Web3, winning international hackathons and speaking at major Ethereum events, including ETHDenver and Devconnect Argentina. As CEO of Elsewhere and creator of Zuvivor, she returns to Devcon to share her unconventional journey and research in privacy-preserving cryptography.",
    photo: {
      src: SamanthaOuyang,
      alt: "Samantha Ouyang at a gallery, standing before framed prints",
    },
  },
  {
    name: "Solène Daviaud",
    role: "Main speaker",
    bio:
      "Solène is an educator and the founder of Dev3pack, a fellowship of 3,000+ builders across 50+ hubs helping women and students move into Web3 and AI.",
    photo: {
      src: SoleneDaviaud,
      alt: "Solène Daviaud at night on a waterfront bridge, a conference badge on a pink lanyard, city towers lit behind",
    },
  },
  {
    name: "Luciano DeAngelo",
    role: "Speaker",
    bio:
      "Luciano founded the blockchain club at the University at Albany in his second semester freshman year. His passion for onboarding the world to decentralized systems grew into Homebase, and more.",
    photo: {
      src: LucianoDeAngelo,
      alt: "Luciano DeAngelo smiling in a navy polo, in front of a tree",
    },
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

      <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 w-full">
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

  return (
    <li class="bg-white rounded-2xl shadow-md border-[1px] border-gray-200 overflow-hidden flex flex-col">
      <img
        src={speaker.photo.src}
        width={960}
        height={960}
        alt={speaker.photo.alt}
        loading="lazy"
        class="w-full aspect-square object-cover object-top"
      />

      <div class="flex-1 p-6 max-sm:p-5 flex flex-col gap-3">
        <span class="text-sm font-bold uppercase tracking-wide text-brand">
          {speaker.role}
        </span>

        <h3 class="text-2xl font-bold leading-tight">
          {speaker.name}
        </h3>

        {speaker.bio && (
          <p class="text-gray-700 leading-relaxed">
            {speaker.bio}
          </p>
        )}
      </div>
    </li>
  )
}
