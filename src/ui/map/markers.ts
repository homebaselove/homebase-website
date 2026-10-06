/**
 * The markers are real buttons: a round house badge from the world down to a
 * region, a pin on the spot once the camera is near a street, and a badge
 * with a count where several events share a place at that zoom. Being
 * elements, they take focus and read aloud. MapLibre positions the outer
 * element with its own transform, so the states that scale a marker live on
 * the button inside it.
 */
import type { MapEvent } from "../../map/MapEvent.ts"
import { describeWhen } from "../../map/time.ts"
import { DotPitch, DotRadius, House } from "../dots.ts"

/** A badge is round and sits on its spot; a pin stands on it. */
export type Shape =
  | "badge"
  | "pin"

const HouseSvg = `<svg viewBox="0 0 ${House.columns * DotPitch} ${
  House.rows * DotPitch
}" fill="currentColor" aria-hidden="true">${
  House
    .dots
    .map((dot) =>
      `<circle cx="${dot.x * DotPitch + DotPitch / 2}" cy="${
        dot.y * DotPitch + DotPitch / 2
      }" r="${DotRadius}"/>`
    )
    .join("")
}</svg>`

function wrap(
  className: string,
  button: HTMLButtonElement,
  onClick: () => void,
): HTMLDivElement {
  const wrapper = document.createElement("div")

  wrapper.className = className
  wrapper.append(button)
  button.type = "button"
  button.addEventListener("click", (click) => {
    click.stopPropagation()
    onClick()
  })

  return wrapper
}

export function markerElement(
  event: MapEvent,
  shape: Shape,
  onClick: () => void,
): HTMLDivElement {
  const button = document.createElement("button")

  button.dataset.slug = event.slug
  button.setAttribute(
    "aria-label",
    [
      event.title,
      event.city,
    ]
      .filter(Boolean)
      .join(", "),
  )

  if (shape === "pin") {
    button.className = "hb-pin"
    button.innerHTML =
      `<span class="hb-pin-head">${HouseSvg}</span><span class="hb-pin-tip"></span>`
  } else {
    button.className = "hb-badge"
    button.innerHTML = HouseSvg
  }

  return wrap("hb-marker", button, onClick)
}

export function clusterElement(
  count: number,
  onClick: () => void,
): HTMLDivElement {
  const button = document.createElement("button")

  button.className = "hb-badge hb-badge-cluster"
  button.innerHTML = `${HouseSvg}<span class="hb-badge-count">${count}</span>`
  button.setAttribute("aria-label", `${count} events here, zoom in`)

  return wrap("hb-marker hb-marker-cluster", button, onClick)
}

/**
 * What a hovered marker shows: each event at it as a link to Luma, so an
 * event is one click away from the world. Luma's text goes in as text, never
 * as markup.
 */
export function previewElement(
  events: readonly MapEvent[],
  more: number,
  next: string | null,
): HTMLElement {
  const root = document.createElement("div")

  root.className = "hb-preview-body"

  if (events.length + more > 1) {
    const heading = document.createElement("p")

    heading.className = "hb-preview-heading"
    heading.textContent = `${events.length + more} events here`
    root.append(heading)
  }

  for (const event of events) {
    const when = describeWhen(event)
    const row = document.createElement("a")
    const title = document.createElement("span")
    const date = document.createElement("span")
    const open = document.createElement("span")

    row.className = "hb-preview-event"
    row.href = event.url
    row.target = "_blank"
    row.rel = "noopener noreferrer"
    title.className = "hb-preview-title"
    title.textContent = event.title
    date.className = "hb-preview-when"
    date.textContent = `${when.date} · ${when.time}`
    open.className = "hb-preview-open"
    open.textContent = "Open on Luma ↗"

    if (event.slug === next) {
      const soon = document.createElement("span")

      soon.className = "hb-preview-next"
      soon.textContent = "Next up"
      row.append(soon)
    }

    row.append(title, date, open)
    root.append(row)
  }

  if (more > 0) {
    const rest = document.createElement("p")

    rest.className = "hb-preview-more"
    rest.textContent = `and ${more} more: zoom in to see them`
    root.append(rest)
  }

  return root
}
