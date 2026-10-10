/** @jsxImportSource preact */
import { useEffect } from "preact"
import { BasedHouseCard } from "../ui/BasedHouse.tsx"
import { Footer } from "../ui/Footer.tsx"
import { Header } from "../ui/Header.tsx"
import { Band } from "../ui/Layout.tsx"
import { LiveCard } from "../ui/live/LiveCard.tsx"
import { MapCard } from "../ui/map/MapCard.tsx"
import { BasedHouseStory } from "../ui/Story.tsx"
import { VideoGallery } from "../ui/VideoGallery.tsx"

export default function() {
  useEffect(() => {
    import("@farcaster/frame-sdk").then((mod) => mod.sdk.actions.ready())
  }, [])

  return (
    <main id="top">
      <Header />

      <Band width="wide">
        <BasedHouseStory />
      </Band>

      <Band width="raised">
        <BasedHouseCard />
      </Band>

      <Band width="wide">
        <MapCard />
      </Band>

      <Band width="narrow">
        <LiveCard />
      </Band>

      <Band width="wide">
        <VideoGallery />
      </Band>

      <div class="pt-16 max-sm:pt-12">
        <Footer />
      </div>
    </main>
  )
}
