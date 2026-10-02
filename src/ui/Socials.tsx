/** @jsxImportSource preact */
export function Socials() {
  return (
    <div class="flex items-center justify-center ">
      <div class="flex flex-wrap justify-center gap-6">
        <a
          href="http://warpcast.com/homebase"
          target="_blank"
          aria-label="Farcaster"
          class="flex items-center hover:opacity-80"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 1000 1000"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z"
              fill="currentColor"
            >
            </path>
            <path
              d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z"
              fill="currentColor"
            >
            </path>
            <path
              d="M675.556 746.667C663.282 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z"
              fill="currentColor"
            >
            </path>
          </svg>
        </a>
        <a
          href="https://x.com/homebasedotlove"
          target="_blank"
          aria-label="Twitter"
          class="flex items-center hover:opacity-80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            width="32"
            height="32"
            viewBox="0 0 30 30"
          >
            <path
              fill="currentColor"
              d="M26.37,26l-8.795-12.822l0.015,0.012L25.52,4h-2.65l-6.46,7.48L11.28,4H4.33l8.211,11.971L12.54,15.97L3.88,26h2.65 l7.182-8.322L19.42,26H26.37z M10.23,6l12.34,18h-2.1L8.12,6H10.23z"
            >
            </path>
          </svg>
        </a>
        <a
          href="https://dexscreener.com/base/0xcfa6173616804aa9974bf7a648149a98b5ce64251f3ed0b9852dd3dc0d8caa24"
          target="_blank"
          aria-label="Dexscreener"
          class="flex items-center hover:opacity-80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <rect
              x="6.6"
              y="2.5"
              width="1.8"
              height="19"
              rx="0.9"
            />
            <rect
              x="3.5"
              y="6"
              width="8"
              height="11"
              rx="1.5"
            />
            <rect
              x="16.6"
              y="5"
              width="1.8"
              height="14"
              rx="0.9"
            />
            <rect
              x="13.5"
              y="8.5"
              width="8"
              height="8"
              rx="1.5"
            />
          </svg>
        </a>
        <a
          href="https://docs.fileverse.io/document/3xrdwjabrTJDy8AxgKdCuG#k=PMLaADggql3fdhpShUOZLCAAXfffpbE0gTo9iZzIh_8"
          target="_blank"
          aria-label="Fileverse"
          class="flex items-center hover:opacity-80"
        >
          {/* Fileverse's stacked-pages smiley, cut to three pages so the face still reads at 32px. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <rect
              x="2.5"
              y="8"
              width="12"
              height="14"
            />
            <path d="M6 8V5H18V19H14.5" />
            <path d="M9.5 5V2H21.5V16H18" />
            <circle
              cx="6.3"
              cy="12.6"
              r="1.3"
              fill="currentColor"
              stroke="none"
            />
            <circle
              cx="10.7"
              cy="12.6"
              r="1.3"
              fill="currentColor"
              stroke="none"
            />
            <path
              d="M5.6 15.2a2.9 2.9 0 0 0 5.8 0z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}
