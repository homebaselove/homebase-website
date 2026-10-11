/** @jsxImportSource preact */
import { useEffect } from "preact"
import { Flywheel } from "../../ui/Flywheel.tsx"
import { Footer } from "../../ui/Footer.tsx"
import { Header } from "../../ui/Header.tsx"
import { Band, SectionHeading } from "../../ui/Layout.tsx"

/** Learn: the Based House flywheel on a page of its own, which the footer links to. */
export default function() {
  useEffect(() => {
    const title = document.title

    document.title = "The Based House flywheel · Homebase"

    return () => {
      document.title = title
    }
  }, [])

  return (
    <main id="top">
      <Header />

      <Band width="wide">
        <SectionHeading
          level={1}
          kicker="Based House × SeedMe"
          title="The Based House flywheel"
          lead="Lockers trade $home; every trade pays a creator fee, and 100% of it funds Based House. The house cultivates founders, founders launch on SeedMe, every claim needs a $home lock, and attention brings more lockers. Set the ETH number; everything else follows."
        />

        <Flywheel />
      </Band>

      <div class="pt-16 max-sm:pt-12">
        <Footer
          link={{
            href: "/",
            label: "Back home",
          }}
        />
      </div>
    </main>
  )
}
