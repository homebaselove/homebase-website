/** @jsxImportSource preact */
import { useRef } from "preact"
import { useSignal } from "preact/signals"
import BasePaint414 from "../../assets/BasedPaint414.png"
import { FundingCard } from "./Funding.tsx"
import { LockCard } from "./Lock.tsx"

/**
 * The Based House section: the raise and the lock card on the left, the
 * BasedPaint blueprint on the right. The fund button in the story lands
 * here. No apostrophes or quotes in prose here: the class scanner pairs any
 * quote with the next one of any kind.
 */
export function BasedHouseCard() {
  return (
    <section
      id="fund"
      class="scroll-mt-8 flex flex-col gap-8"
    >
      <div class="max-w-[640px] mx-auto text-center">
        <div class="text-sm font-bold uppercase tracking-wide text-brand">
          Up next
        </div>

        <h2 class="text-4xl max-sm:text-3xl font-bold mt-1">
          Based House Mumbai
        </h2>

        <p class="mt-3 text-gray-600">
          Physical space for builders and creators to gather, work, and learn
          together. Every creator fee $home earns funds the next one.
        </p>
      </div>

      <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div class="flex flex-col gap-8">
          <FundingCard />
          <LockCard />
        </div>

        <div class="flex flex-col items-center lg:pt-4">
          <div class="w-full max-w-[400px] px-6">
            <BasedHouseBlueprint />
          </div>

          <div class="text-gray-600 text-center mt-10">
            BasedPaint #414 by creamy.eth
          </div>
        </div>
      </div>
    </section>
  )
}

/** Where the blueprint rests, and swings back to, in degrees. */
const Rest = {
  x: 22,
  y: -18,
}

/** How far the blueprint tilts when the pointer reaches an edge. */
const MaxTilt = 18

/**
 * The BasedPaint blueprint as a slab that tilts toward the pointer. A static
 * square frame owns the perspective and the pointer math, so the angles come
 * from an untransformed box and every point of the square answers, however
 * the slab is turned. Pointer events cover a hovering mouse and a dragging
 * finger alike. While the pointer is on it the slab follows with no easing,
 * one update per frame; on release it swings back to rest over half a
 * second. A glare slides across the face with the pointer. Readers who ask
 * for reduced motion get the resting slab.
 */
export function BasedHouseBlueprint() {
  const frame = useRef<HTMLDivElement>(null)
  const pending = useRef(0)
  const rotation = useSignal(Rest)
  const glare = useSignal({
    x: 50,
    y: 50,
  })
  const active = useSignal(false)

  const track = (e: PointerEvent) => {
    const el = frame.current

    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const rect = el.getBoundingClientRect()
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))

    cancelAnimationFrame(pending.current)
    pending.current = requestAnimationFrame(() => {
      rotation.value = {
        x: -ny * MaxTilt,
        y: nx * MaxTilt,
      }
      glare.value = {
        x: (nx + 1) * 50,
        y: (ny + 1) * 50,
      }
      active.value = true
    })
  }

  const settle = () => {
    cancelAnimationFrame(pending.current)
    active.value = false
    rotation.value = Rest
  }

  return (
    <div
      ref={frame}
      class="aspect-square relative select-none cursor-grab active:cursor-grabbing"
      style="perspective: 1000px; touch-action: pan-y"
      onPointerMove={track}
      onPointerDown={(e) => {
        // Only a real pointer can be captured; a synthetic one still tilts.
        if (e.isTrusted) {
          e.currentTarget.setPointerCapture(e.pointerId)
        }

        track(e)
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") {
          settle()
        }
      }}
      onPointerCancel={settle}
      onPointerLeave={settle}
    >
      <div
        class="absolute inset-0"
        style={{
          transform: active.value
            ? `rotateX(${rotation.value.x}deg) rotateY(${rotation.value.y}deg) scale3d(1.03, 1.03, 1.03)`
            : `rotateX(${rotation.value.x}deg) rotateY(${rotation.value.y}deg)`,
          transformStyle: "preserve-3d",
          willChange: "transform",
          transition: active.value
            ? "none"
            : "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: "8px 8px 16px rgba(0, 0, 0, 0.2)",
        }}
      >
        <img
          src={BasePaint414}
          alt="BasedPaint #414"
          draggable={false}
          class="w-full h-full object-cover"
        />

        <div
          aria-hidden="true"
          class="absolute inset-0 pointer-events-none mix-blend-soft-light"
          style={{
            background:
              `radial-gradient(circle at ${glare.value.x}% ${glare.value.y}%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 60%)`,
            opacity: active.value ? 1 : 0,
            transition: "opacity 300ms ease",
          }}
        />

        {/* Shadow layer */}
        <img
          src={BasePaint414}
          // String() is an empty alt without an empty literal, which the class
          // scanner misreads, dropping classes further down this file.
          alt={String()}
          draggable={false}
          class="absolute inset-0 w-full h-full object-cover -z-10"
          style={{
            transform: "translateZ(-20px) scale(1.05)",
            boxShadow: "0 0 20px rgba(0, 0, 0, 0.4)",
          }}
        />

        {/* 3D side faces */}
        <div
          class="absolute -right-2 -bottom-2 top-2 w-8 bg-gray-300 -z-20"
          style={{
            transform: "rotateY(-90deg) translateX(-4px)",
            transformOrigin: "right",
          }}
        >
        </div>
        <div
          class="absolute -bottom-2 -left-2 right-2 h-8 bg-gray-400 -z-20"
          style={{
            transform: "rotateX(90deg) translateY(-4px)",
            transformOrigin: "bottom",
          }}
        >
        </div>
      </div>
    </div>
  )
}
