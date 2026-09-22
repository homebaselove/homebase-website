/** @jsxImportSource preact */
import { SeedMeUrl } from "../funding.ts"

export function AboutHomebase() {
  return (
    <div class="flex flex-col gap-4 py-1">
      <h2 class="text-3xl max-sm:text-2xl font-bold">
        About Homebase
      </h2>

      <p class="text-gray-600">
        Homebase organizes events, hacker houses, and workshops for builders and
        creators on Base — livestreamed build sessions, people in a room, work
        that ships.
      </p>

      <p class="text-gray-600">
        It all points at one thing: <strong class="font-semibold text-gray-900">
          Based House
        </strong>, a physical space for builders and creators to gather, work,
        and learn together.
      </p>

      <h3 class="text-xl font-bold mt-2">
        Why SeedMe
      </h3>

      <p class="text-gray-600">
        Houses cost money, and passing a hat around doesn't scale. So we
        built{" "}
        <a
          href={SeedMeUrl}
          target="_blank"
          rel="noreferrer"
          class="text-brand hover:underline font-semibold"
        >
          SeedMe
        </a>, a permissionless token launcher, and wired the economics back to
        the house: 100% of the creator fees $home earns land in the Bankr
        address that funds Based House. That's the number on the left, live.
      </p>

      <h3 class="text-xl font-bold mt-2">
        $seed is next
      </h3>

      <p class="text-gray-600">
        Lock $home to be eligible to claim. Claims are limited, and the homies
        who lock early get priority.
      </p>

      <a
        href={SeedMeUrl}
        target="_blank"
        rel="noreferrer"
        class="text-brand font-semibold hover:underline mt-1"
      >
        Open SeedMe →
      </a>
    </div>
  )
}
