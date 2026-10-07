/**
 * The Based House story as the homepage tells it: one chapter per house, plus
 * the letter that started it, the workshops that built the foundation, and
 * where it stands today. The figures come from each house's retrospective.
 */

import DevconnectCrew from "../assets/story/DevconnectCrew.webp"
import DevconnectRecapCast from "../assets/story/DevconnectRecapCast.webp"
import EthDenverCrew from "../assets/story/EthDenverCrew.webp"
import EthDenverReturnCrew from "../assets/story/EthDenverReturnCrew.webp"
import HomebaseMapAnnouncement from "../assets/story/HomebaseMapAnnouncement.webp"
import JesseHappyToFund from "../assets/story/JesseHappyToFund.webp"
import LetterToJesseCast from "../assets/story/LetterToJesseCast.webp"
import LetterToJesseV2Cast from "../assets/story/LetterToJesseV2Cast.webp"
import MumbaiAnnouncement from "../assets/story/MumbaiAnnouncement.webp"

export interface StoryLink {
  label: string
  href: string
}

/**
 * A photo on the cover of a chapter; clicking it opens href. The pixel size
 * sets its share of the cover beside another photo and holds its space
 * while it loads. A photo that fills the cover is cropped from its middle,
 * or kept from its top when the faces are there.
 */
export interface CoverPhoto {
  src: string
  width: number
  height: number
  alt: string
  href: string
  focus?: "top"
}

export interface StoryStat {
  value: string
  label: string
}

export interface Chapter {
  id: string
  /** First day of the chapter, as YYYY-MM, which orders the timeline. */
  month: string
  /** How the month reads on the page. */
  when: string
  /** The small label above the title: which house, or what kind of step. */
  kicker: string
  title: string
  /**
   * Up to two portrait photos, or one landscape, of the actual event. They
   * sit on top of the card and each links to its source.
   */
  cover?: CoverPhoto[]
  /** One short paragraph: what happened and why it mattered. */
  summary: string
  stats?: StoryStat[]
  links: StoryLink[]
}

export const LetterToJesseV1Url = "https://farcaster.xyz/rafi/0x14fd4e8e"

const LetterToJesseV2Url = "https://farcaster.xyz/luciano/0xf5061233"

const EthDenverRecapVideoUrl =
  "https://x.com/lucianodeangeIo/status/1899183264759439586?s=20"

const DevconnectRecapUrl = "https://farcaster.xyz/luciano/0x78eb1ae0"

const HomebaseMapAnnouncementUrl = "https://farcaster.xyz/luciano/0x1897f428"

const EthDenverReturnRecapUrl =
  "https://x.com/homebasedotlove/status/2029929738454847972"

/** Where applications for the next house go. */
const BasedHouseMumbaiApplyUrl = "https://forms.gle/vXRkM4qnAVeQpX"

export const Chapters: Chapter[] = [
  {
    id: "inception",
    month: "2025-01",
    when: "Early 2025",
    kicker: "Inception",
    title: "A letter to Jesse",
    cover: [
      {
        src: JesseHappyToFund,
        width: 820,
        height: 564,
        alt:
          "samuellhuber.eth asks on Farcaster whether there is a Base house at ETHDenver, and jessepollak replies: happy to fund one if you want to get a crew together",
        href: LetterToJesseV1Url,
      },
      {
        src: LetterToJesseCast,
        width: 900,
        height: 841,
        alt:
          "rafi casts: Dear jessepollak, we want to build a Based House at ETHDenver with luciano and samuellhuber.eth. Will you help us? Below, a letter in an envelope reads Dear Jesse, we got the crew. Based Crew",
        href: LetterToJesseV1Url,
      },
    ],
    summary:
      "Homebase asked Base for a house where based builders and creators could live and build together at the events that matter, as a letter to Jesse shipped as a Farcaster miniapp. The plan had three legs: Build Board online, Based House residencies at Ethereum events, and permanent coworking once the houses proved the appetite.",
    links: [
      {
        label: "Letter to Jesse V1",
        href: LetterToJesseV1Url,
      },
    ],
  },
  {
    id: "ethdenver-2025",
    month: "2025-02",
    when: "Feb – Mar 2025",
    kicker: "1st Based House",
    title: "Based House ETHDenver",
    cover: [
      {
        src: EthDenverCrew,
        width: 1280,
        height: 616,
        alt:
          "The Based House ETHDenver crew standing together in the living room, captioned ETH Denver - Based House",
        href: EthDenverRecapVideoUrl,
      },
    ],
    summary:
      "Nine days in Lakewood, Colorado with Kismet Casa around ETHDenver. Fourteen residents from seven countries hosted a Based BBQ, Base Game Day, three workshops and FarHack, a live Farcaster hackathon. Homebase has incubated SeedMe for the founders in residence ever since.",
    stats: [
      {
        value: "14",
        label: "residents from 7 countries",
      },
      {
        value: "6",
        label: "events, 200+ attendees",
      },
      {
        value: "$3k",
        label: "in FarHack prizes",
      },
      {
        value: "30k+",
        label: "impressions on socials",
      },
    ],
    links: [
      {
        label: "Retrospective",
        href:
          "https://docs.google.com/presentation/d/1HMOmPOZU0LBbKLtSVmbBxai4nk2YIlB8kAK7C_c8YBA/edit?usp=sharing",
      },
      {
        label: "Recap vid",
        href: EthDenverRecapVideoUrl,
      },
    ],
  },
  {
    id: "base-batches",
    month: "2025-04",
    when: "Apr – May 2025",
    kicker: "Building the foundation",
    title: "Base Batches workshops and the Homebase Map",
    cover: [
      {
        src: HomebaseMapAnnouncement,
        width: 1116,
        height: 558,
        alt:
          "The Homebase Map as announced: under the Homebase wordmark, a world map with a house pin on every Base meetup, from the Americas to Europe, Africa, Asia and Oceania, with a button to find your location and one to connect a wallet",
        href: HomebaseMapAnnouncementUrl,
      },
    ],
    summary:
      "Homebase ran the workshops for the very first Base Batches, for the community by the community: ten online sessions with Base DevRel and house alumni, plus an IRL format community hosts ran in 50+ cities. The Homebase Map put every Base meetup on one map, with onchain attendance.",
    stats: [
      {
        value: "10",
        label: "online sessions",
      },
      {
        value: "50+",
        label: "cities with community hosts",
      },
      {
        value: "10k+",
        label: "viewers",
      },
    ],
    links: [
      {
        label: "Workshops",
        href: "https://farcaster.xyz/rafi/0xdb995f78",
      },
      {
        label: "New York event",
        href: "https://farcaster.xyz/luciano/0x2aeb8061",
      },
      {
        label: "Homebase Map",
        href: HomebaseMapAnnouncementUrl,
      },
    ],
  },
  {
    id: "letter-v2",
    month: "2025-09",
    when: "Fall 2025",
    kicker: "Second letter",
    title: "A second letter to Jesse",
    cover: [
      {
        src: LetterToJesseV2Cast,
        width: 1110,
        height: 240,
        alt:
          "luciano casts: Dear jesse.base.eth, we got the crew back together to build another Based House in Argentina for Devconnect with leaolmos.eth and rafi. Shall we run it back?",
        href: LetterToJesseV2Url,
      },
      {
        src: DevconnectRecapCast,
        width: 1088,
        height: 290,
        alt:
          "luciano casts: Based House Devconnect Retrospective. A residency for developers and artists to collaborate during Devconnect Buenos Aires by kismet and homebase, supported by base.base.eth",
        href: DevconnectRecapUrl,
      },
    ],
    summary:
      "With the first house proven, Luciano wrote to Jesse again, as a miniapp: the crew was back together to build another Based House, this time in Argentina for Devconnect, with leaolmos.eth and rafi. Shall we run it back? The answer became the second house.",
    links: [
      {
        label: "Letter to Jesse V2",
        href: LetterToJesseV2Url,
      },
    ],
  },
  {
    id: "devconnect-2025",
    month: "2025-11",
    when: "Nov 2025",
    kicker: "2nd Based House",
    title: "Based House Devconnect",
    cover: [
      {
        src: DevconnectCrew,
        width: 1280,
        height: 768,
        alt:
          "The Based House Devconnect crew packed onto and around a sofa in Buenos Aires, with the Based House Devconnect logo on the screen behind them",
        href: DevconnectRecapUrl,
      },
    ],
    summary:
      "Ten days in Buenos Aires with Kismet Casa for Devconnect. Fifteen residents, most of them Zora artists, curated the Onchain Art Hub for five days, hosted a Base meetup and the Based Asado, and shipped five miniapps and eleven artworks.",
    stats: [
      {
        value: "15",
        label: "residents from 5 countries",
      },
      {
        value: "5",
        label: "live miniapps",
      },
      {
        value: "11",
        label: "artworks, 2 shared",
      },
      {
        value: "200k+",
        label: "views on socials",
      },
    ],
    links: [
      {
        label: "Retrospective",
        href:
          "https://docs.google.com/presentation/d/1gnJNH1Xijv3xO3tQ3cOg5QIYwq7PfdwLwEH6YvuNfm0/edit?usp=sharing",
      },
      {
        label: "Public recap",
        href: DevconnectRecapUrl,
      },
    ],
  },
  {
    id: "ethdenver-2026",
    month: "2026-02",
    when: "Feb – Mar 2026",
    kicker: "3rd Based House",
    title: "Back at ETHDenver",
    cover: [
      {
        src: EthDenverReturnCrew,
        width: 675,
        height: 520,
        alt:
          "The third Based House crew piled onto the sectional couches of the Denver house, waving at the camera",
        href: EthDenverReturnRecapUrl,
        focus: "top",
      },
    ],
    summary:
      "Announced on the last slide of the Devconnect retrospective, the third house brought Based House back to Denver a year after the first, with a new cohort of residents, a new round of events and a public recap of everything they shipped.",
    links: [
      {
        label: "Recap thread",
        href: EthDenverReturnRecapUrl,
      },
      {
        label: "Retrospective",
        href:
          "https://docs.google.com/document/d/1Zh5SZ2i44QdsJQrmp3wf7bxBDFygjLjFnZvh9FwDBAU/edit?usp=sharing",
      },
      {
        label: "Public recap",
        href: "https://farcaster.xyz/luciano/0xd7163964",
      },
    ],
  },
  {
    id: "today",
    month: "2026-10",
    when: "Today",
    kicker: "Where we are",
    title: "Based House Mumbai",
    cover: [
      {
        src: MumbaiAnnouncement,
        width: 980,
        height: 184,
        alt:
          "Homebase posts on X: Announcing Based House Mumbai. Apply to Based House Mumbai at forms.gle/vXRkM4qnAVeQpX",
        href: BasedHouseMumbaiApplyUrl,
      },
    ],
    summary:
      "The next house is headed to Mumbai, and the community funds it directly: every creator fee $home earns goes to Based House Mumbai. Applications are open, founders in residence keep launching through SeedMe, and locking $home grants access to their claims. Welcome home. Welcome to Base.",
    links: [
      {
        label: "Apply to Based House Mumbai",
        href: BasedHouseMumbaiApplyUrl,
      },
      {
        label: "Fund Based House Mumbai",
        href: "#fund",
      },
    ],
  },
]
