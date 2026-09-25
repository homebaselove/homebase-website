/** @jsxImportSource preact */
import { SeedMeLockUrl } from "../funding.ts"
import { HomeToken, InfoCard } from "./InfoCard.tsx"

export function LockCard() {
  return (
    <InfoCard
      label="Lock $home details"
      header={
        <h2 class="text-3xl max-sm:text-2xl font-bold leading-none">
          Lock $home
        </h2>
      }
      bullets={[
        <>
          Homebase incubates founders who launch on SeedMe
        </>,
        <>
          SeedMe allows you to claim an allocation prior to launch
        </>,
        <>
          Locking <HomeToken /> grants access to SeedMe claims
        </>,
        <>
          More commitment potentially means better allocations
        </>,
      ]}
    >
      <a
        href={SeedMeLockUrl}
        target="_blank"
        class="btn-brand"
      >
        SeedMe
      </a>
    </InfoCard>
  )
}
