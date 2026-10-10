/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import { useSignal } from "preact/signals"
import BasePaint414 from "../../assets/BasedPaint414.png"
import { FundingCard } from "./Funding.tsx"
import { SectionHeading } from "./Layout.tsx"

/**
 * The Based House section: the funding card on the left, the BasedPaint
 * blueprint on the right, centered on each other where they sit side by
 * side. The fund button in the story lands here. No apostrophes or quotes
 * in prose here: the class scanner pairs any quote with the next one of any
 * kind.
 */
export function BasedHouseCard() {
  return (
    <section
      id="fund"
      class="scroll-mt-8 flex flex-col gap-8"
    >
      <SectionHeading
        kicker="Up next"
        title="Based House Mumbai"
      />

      <div class="grid items-start lg:items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <FundingCard />

        <div class="flex flex-col items-center">
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

interface Point {
  x: number
  y: number
}

/** Where the blueprint rests, and falls back to, in degrees. */
const Rest: Point = {
  x: 22,
  y: -18,
}

/** How far the blueprint tilts when the pointer reaches an edge, or when it is carried that far. */
const MaxTilt = 18

/** Pixels of carry per degree of tilt while the blueprint is held. */
const CarryPerDegree = 8

/** How much of its width the blueprint may carry past a side of the screen. */
const Overhang = 0.6

/** How long the fall back into place takes, during which a hovering mouse is ignored. */
const FallMs = 750

const Still: Point = {
  x: 0,
  y: 0,
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value))

/**
 * The BasedPaint blueprint as a slab the reader can pick up. A static square
 * frame owns the perspective and the pointer math, so the angles come from
 * an untransformed box and the slab has a place to fall back to. A hovering
 * mouse tilts it toward the pointer. Pressing picks it up, with the mouse or
 * with a finger moving sideways, since a finger moving up or down scrolls
 * the page as ever: it follows the pointer, tilts with the carry, casts a
 * deeper shadow, and can go no further than most of its width past a side
 * of the screen or its own height up or down. On release it falls back into
 * place with a small bounce, which a mouse passing over it does not cut
 * short. One pointer holds it at a time, and only the first button of a
 * mouse. Readers who ask for reduced motion get the resting slab, and a
 * carried one that returns without the bounce.
 */
export function BasedHouseBlueprint() {
  const frame = useRef<HTMLDivElement>(null)
  const pending = useRef(0)
  const returning = useRef(0)
  const grip = useRef<
    {
      pointerId: number
      pointer: Point
      offset: Point
      tilt: Point
      least: Point
      most: Point
    } | null
  >(null)
  const rotation = useSignal(Rest)
  const offset = useSignal(Still)
  const glare = useSignal({
    x: 50,
    y: 50,
  })
  const hovering = useSignal(false)
  const held = useSignal(false)

  useEffect(() => () => {
    cancelAnimationFrame(pending.current)
    clearTimeout(returning.current)
  }, [])

  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches

  /** The pointer as a place within the frame, from -1 to 1 each way. */
  const within = (e: PointerEvent): Point => {
    const rect = frame.current!.getBoundingClientRect()

    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      y: clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
    }
  }

  const tiltToward = (at: Point): Point => ({
    x: -at.y * MaxTilt,
    y: at.x * MaxTilt,
  })

  const glareAt = (at: Point): Point => ({
    x: (at.x + 1) * 50,
    y: (at.y + 1) * 50,
  })

  const onNextFrame = (update: () => void) => {
    cancelAnimationFrame(pending.current)
    pending.current = requestAnimationFrame(update)
  }

  const hover = (e: PointerEvent) => {
    if (!frame.current || returning.current || calm()) {
      return
    }

    const at = within(e)

    onNextFrame(() => {
      rotation.value = tiltToward(at)
      glare.value = glareAt(at)
      hovering.value = true
    })
  }

  const pickUp = (e: PointerEvent) => {
    const el = frame.current

    if (!el || grip.current) {
      return
    }

    const rect = el.getBoundingClientRect()
    const at = within(e)

    grip.current = {
      pointerId: e.pointerId,
      pointer: {
        x: e.clientX,
        y: e.clientY,
      },
      offset: offset.value,
      tilt: calm() ? Rest : tiltToward(at),
      least: {
        x: -(rect.left + rect.width * Overhang),
        y: -rect.height,
      },
      most: {
        x: innerWidth - rect.right + rect.width * Overhang,
        y: rect.height,
      },
    }
    cancelAnimationFrame(pending.current)
    clearTimeout(returning.current)
    returning.current = 0
    held.value = true
    hovering.value = false
    rotation.value = grip.current.tilt
    glare.value = glareAt(at)
  }

  const carry = (e: PointerEvent) => {
    const hold = grip.current

    if (!hold || e.pointerId !== hold.pointerId) {
      return
    }

    const to: Point = {
      x: clamp(
        hold.offset.x + e.clientX - hold.pointer.x,
        hold.least.x,
        hold.most.x,
      ),
      y: clamp(
        hold.offset.y + e.clientY - hold.pointer.y,
        hold.least.y,
        hold.most.y,
      ),
    }
    const at = within(e)
    const still = calm()

    onNextFrame(() => {
      offset.value = to
      rotation.value = still ? Rest : {
        x: clamp(hold.tilt.x - to.y / CarryPerDegree, -MaxTilt, MaxTilt),
        y: clamp(hold.tilt.y + to.x / CarryPerDegree, -MaxTilt, MaxTilt),
      }
      glare.value = glareAt(at)
    })
  }

  const drop = (e: PointerEvent) => {
    const hold = grip.current

    if (!hold || e.pointerId !== hold.pointerId) {
      return
    }

    grip.current = null
    cancelAnimationFrame(pending.current)
    held.value = false
    hovering.value = false
    offset.value = Still
    rotation.value = Rest
    clearTimeout(returning.current)
    returning.current = window.setTimeout(() => {
      returning.current = 0
    }, FallMs)
  }

  const settle = () => {
    if (grip.current) {
      return
    }

    cancelAnimationFrame(pending.current)
    hovering.value = false
    rotation.value = Rest
  }

  const scale = held.value ? 1.06 : hovering.value ? 1.03 : 1
  const moving = held.value || hovering.value

  return (
    <div
      ref={frame}
      data-blueprint="frame"
      class={held.value
        ? "aspect-square relative z-30 select-none cursor-grabbing"
        : "aspect-square relative select-none cursor-grab"}
      style="perspective: 1000px; touch-action: pan-y pinch-zoom"
      onPointerMove={(e) => {
        if (grip.current) {
          carry(e)
        } else if (e.pointerType === "mouse") {
          hover(e)
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) {
          return
        }

        // Only a real pointer can be captured; a synthetic one is still held.
        if (e.isTrusted) {
          e.currentTarget.setPointerCapture(e.pointerId)
        }

        pickUp(e)
      }}
      onPointerUp={drop}
      onPointerCancel={drop}
      onPointerLeave={settle}
    >
      <div
        data-blueprint="slab"
        class="absolute inset-0"
        style={{
          transform:
            `translate3d(${offset.value.x}px, ${offset.value.y}px, 0) rotateX(${rotation.value.x}deg) rotateY(${rotation.value.y}deg) scale3d(${scale}, ${scale}, ${scale})`,
          transformStyle: "preserve-3d",
          willChange: "transform",
          transition: moving
            ? "box-shadow 200ms ease"
            : calm()
            ? "transform 200ms ease, box-shadow 200ms ease"
            : "transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 300ms ease",
          boxShadow: held.value
            ? "18px 28px 40px rgba(0, 0, 0, 0.28)"
            : "8px 8px 16px rgba(0, 0, 0, 0.2)",
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
            opacity: moving ? 1 : 0,
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
