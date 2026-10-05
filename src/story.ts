/**
 * The Based House story as the homepage tells it: one chapter per house, plus
 * the letter that started it, the workshops that built the foundation, and
 * where it stands today. The figures come from each house's retrospective.
 */

export interface StoryLink {
  label: string
  href: string
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
  paragraphs: string[]
  stats?: StoryStat[]
  links: StoryLink[]
}

export const LetterToJesseV1Url = "https://farcaster.xyz/rafi/0x14fd4e8e"

export const LetterToJesseV2Url = "https://farcaster.xyz/luciano/0xf5061233"

export const Chapters: Chapter[] = [
  {
    id: "inception",
    month: "2025-01",
    when: "Early 2025",
    kicker: "Inception",
    title: "A letter to Jesse",
    paragraphs: [
      "Homebase started as a community initiative to grow the Base ecosystem, with a simple question: what if based builders and creators had a home at the events that matter? The answer went public as a letter to Jesse, shipped as a Farcaster miniapp: a pitch for a house where residents could live, work and build together for the length of a hackathon.",
      "The plan had three legs. Build Board online, so based builders could find bounties, grants and hackathons in one place. Based House as temporary residencies at quality Ethereum events. And permanent coworking in cities around the world once the houses had proven the appetite for it.",
    ],
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
    paragraphs: [
      "The first house opened in Lakewood, Colorado, hosted with Kismet Casa for nine days around ETHDenver. Fourteen residents from seven countries moved in: founders and builders from Neynar, Fairmint, Precog, FarHack, Grow, Starta, Howler, Swiddle and more.",
      "The house hosted a Based BBQ, Base Game Day with a creator session, three workshops and FarHack, a live Farcaster hackathon with six bounties from three sponsors. Family dinners, two all-nighters and five live submissions later, the proof of work was in, and Homebase has incubated SeedMe for the founders in residence ever since.",
    ],
    stats: [
      {
        value: "14",
        label: "residents from 7 countries",
      },
      {
        value: "9",
        label: "days in Denver",
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
        label: "Retrospective: proof of work + OG vision",
        href:
          "https://docs.google.com/presentation/d/1HMOmPOZU0LBbKLtSVmbBxai4nk2YIlB8kAK7C_c8YBA/edit?usp=sharing",
      },
    ],
  },
  {
    id: "base-batches",
    month: "2025-04",
    when: "Apr – May 2025",
    kicker: "Building the foundation",
    title: "Base Batches workshops and the Homebase Map",
    paragraphs: [
      "Straight after Denver, Homebase ran the workshops for the very first Base Batches, for the community by the community. Ten online sessions across three weeks took builders from \"why onchain\" through OnchainKit, MiniKit, AgentKit, smart wallets, onchain games and smart contracts, taught by Base DevRel, Farcaster founders and the builders who had lived in the house. The recordings are in the video gallery below.",
      "The series came with an IRL format any community host could run, and Base communities around the world did, from Pune to New York. To show them all in one place, Homebase built the Homebase Map: a global map of Base meetups with onchain attendance attestations, so every workshop could be found and every attendee could prove they were there.",
    ],
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
        value: "1",
        label: "map of them all",
      },
    ],
    links: [
      {
        label: "Base Batches workshops",
        href: "https://farcaster.xyz/rafi/0xdb995f78",
      },
      {
        label: "New York Base Batches event",
        href: "https://farcaster.xyz/luciano/0x2aeb8061",
      },
      {
        label: "Homebase Map",
        href: "https://farcaster.xyz/luciano/0x1897f428",
      },
    ],
  },
  {
    id: "devconnect-2025",
    month: "2025-11",
    when: "Nov 2025",
    kicker: "2nd Based House",
    title: "Based House Devconnect",
    paragraphs: [
      "It started with another letter to Jesse, again as a miniapp, and ended with ten days in the heart of Buenos Aires. Kismet Casa and Homebase brought fifteen residents from five countries together for Devconnect, this time with creators at the centre: most of the house was Zora artists, alongside builders from dTech, Tortoise, Vector and Scratch.",
      "For five of those days the house curated the Onchain Art Hub, platforming artists from across Latin America, and hosted a Base meetup with art curation and live performances, plus the Based House Asado. The residents shipped five live miniapps and eleven artworks, two of them made together.",
      "The vision sharpened here too: Based House as temporary residencies during Ethereum events, and Homebase Hubs as the permanent coworking spaces those residencies make room for, each feeding the other through the onchain community.",
    ],
    stats: [
      {
        value: "15",
        label: "residents from 5 countries",
      },
      {
        value: "10",
        label: "days in Buenos Aires",
      },
      {
        value: "5",
        label: "live miniapps",
      },
      {
        value: "11",
        label: "artworks, 2 collaborative",
      },
      {
        value: "200k+",
        label: "views on socials",
      },
    ],
    links: [
      {
        label: "Letter to Jesse V2",
        href: LetterToJesseV2Url,
      },
      {
        label: "Retrospective: proof of work + updated vision",
        href:
          "https://docs.google.com/presentation/d/1gnJNH1Xijv3xO3tQ3cOg5QIYwq7PfdwLwEH6YvuNfm0/edit?usp=sharing",
      },
      {
        label: "Public recap",
        href: "https://farcaster.xyz/luciano/0x78eb1ae0",
      },
    ],
  },
  {
    id: "ethdenver-2026",
    month: "2026-02",
    when: "Feb – Mar 2026",
    kicker: "3rd Based House",
    title: "Back at ETHDenver",
    paragraphs: [
      "Announced on the last slide of the Devconnect retrospective, the third house brought Based House back to where it began. A year on from the first residency, the house returned to Denver with a new cohort of residents, a new round of events and a public recap of everything they shipped.",
    ],
    links: [
      {
        label: "Recap thread",
        href: "https://x.com/homebasedotlove/status/2029929738454847972",
      },
      {
        label: "Retrospective: proof of work",
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
    paragraphs: [
      "Three houses, two continents and one flywheel later, the next house is headed to Mumbai. This time the community funds it directly: every creator fee $home earns goes to Based House Mumbai, and the raise at the top of this page shows how far along it is.",
      "The founders in residence keep launching through SeedMe, which Homebase has incubated since the first house, and locking $home is what grants access to their claims. Welcome home. Welcome to Base.",
    ],
    links: [
      {
        label: "Fund Based House Mumbai",
        href: "#top",
      },
    ],
  },
]
