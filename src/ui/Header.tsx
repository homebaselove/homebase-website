/** @jsxImportSource preact */
import { HouseLogo } from "./HouseLogo.tsx"
import { Socials } from "./Socials.tsx"
import { Wordmark } from "./Wordmark.tsx"

export function Header() {
  return (
    <div
      class="bg-brand"
      style="
          margin-top: -80px;
          transform: translateY(80px);
        "
    >
      <div class="relative overflow-hidden">
        <div class="w-full max-w-[960px] mx-auto px-6 text-center flex flex-col items-center">
          <div class="mt-12 w-24 max-sm:w-20 text-white">
            <HouseLogo />
          </div>

          <div class="mt-7 w-[64%] max-sm:w-[90%] text-white">
            <Wordmark />
          </div>

          <p class="text-white/80 mt-6 mb-6 text-lg max-sm:text-base">
            Where based builders and creators come to grow.
          </p>

          <div class="text-white mb-5">
            <Socials />
          </div>
        </div>

        <div style="height: 100px">
          <div style="
              z-index: -1;
              position: absolute;
              left: 50%;
              bottom: 0;
              transform: translate(-50%, 50%);
              background: #fff;
              clip-path: ellipse(max(40%, 700px) 50% at 50% 50%);
              width: 140%;
              height: 200px;
            ">
          </div>
        </div>
      </div>
    </div>
  )
}
