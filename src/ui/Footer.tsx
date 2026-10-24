/** @jsxImportSource preact */
import { BrandKitUrl } from "../brand.ts"
import { HouseLogo } from "./HouseLogo.tsx"
import { Socials } from "./Socials.tsx"

const LinkClass =
  "text-lg max-sm:text-base font-bold whitespace-nowrap rounded-md underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"

/**
 * The foot of every page: the house in the middle, with the social links in
 * the bottom left and, in the bottom right, the brand kit and one text link,
 * Learn more unless a page names another, as the header pairs the links with
 * the wallet.
 */
export function Footer(props: {
  readonly link?: {
    readonly href: string
    readonly label: string
  }
}) {
  const link = props.link ?? {
    href: "/learn",
    label: "Learn more",
  }

  return (
    <div class="bg-brand w-full p-5 overflow-hidden relative">
      <div class="relative">
        {/* White curved top section */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "0",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            clipPath: "ellipse(min(100vw, 1200px) 120px at 50% 50%)",
            width: "200%",
            height: "240px",
            zIndex: "1",
          }}
        >
        </div>

        {/* Content section with proper spacing */}
        <div class="relative pt-40 pb-1 flex flex-col gap-10 max-sm:gap-8">
          <div class="w-24 mx-auto text-white">
            <HouseLogo />
          </div>

          <div class="flex items-center justify-between gap-4 text-white">
            <Socials />

            <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
              {/* The deck opens in a new tab, as the ecosystem deck does. */}
              <a
                href={BrandKitUrl}
                target="_blank"
                aria-label="Brand kit (PDF)"
                class={LinkClass}
              >
                Brand kit
              </a>

              <a
                href={link.href}
                class={LinkClass}
              >
                {link.label}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
