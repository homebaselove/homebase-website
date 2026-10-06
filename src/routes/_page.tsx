/** @jsxImportSource preact */
import { useEffect } from "preact"
import { BasedHouseCard } from "../ui/BasedHouse.tsx"
import { Footer } from "../ui/Footer.tsx"
import { Header } from "../ui/Header.tsx"
import { MapCard } from "../ui/map/MapCard.tsx"
import { BasedHouseStory } from "../ui/Story.tsx"
import { VideoGallery } from "../ui/VideoGallery.tsx"
import { WorkshopListCard } from "../ui/Workshop.tsx"

export default function() {
  useEffect(() => {
    import("@farcaster/frame-sdk").then((mod) => mod.sdk.actions.ready())
  }, [])

  return (
    <main id="top">
      <Header />

      <div
        class={`flex flex-col mt-16 w-full max-w-[1140px] mx-auto px-4 z-10 relative gap-8`}
      >
        <BasedHouseStory />
      </div>

      <div
        class={`flex flex-col pt-14 w-full max-w-[960px] mx-auto px-4 z-10 relative gap-8`}
      >
        <BasedHouseCard />
      </div>

      <div
        class={`flex flex-col pt-14 w-full max-w-[1140px] mx-auto px-4 z-10 relative gap-8`}
      >
        <MapCard />
      </div>

      <div
        class={`flex flex-col pt-10 w-full max-w-[840px] mx-auto px-4 z-10 relative gap-8`}
      >
        <WorkshopListCard />
      </div>

      <div
        class={`flex flex-col pt-6 w-full max-w-[1140px] mx-auto px-4 z-10 relative gap-8`}
      >
        <VideoGallery />
      </div>
      <div class={`flex flex-col pt-6 w-full max-w-full relative gap-8`}>
        <Footer />
      </div>
    </main>
  )
}
