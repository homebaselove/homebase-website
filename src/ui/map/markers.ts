/**
 * The markers are real buttons: a pin carrying the dot-matrix house, and a
 * cluster carrying a count. Being elements, they take focus and read aloud.
 * MapLibre positions the outer element with its own transform, so the states
 * that scale a marker live on the button inside it.
 */
import type { MapEvent } from "../../map/MapEvent.ts"
import { DotPitch, DotRadius, House } from "../dots.ts"

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
  onClick: () => void,
): HTMLDivElement {
  const button = document.createElement("button")

  button.className = "hb-pin"
  button.setAttribute(
    "aria-label",
    [
      event.title,
      event.city,
    ]
      .filter(Boolean)
      .join(", "),
  )
  button.innerHTML =
    `<span class="hb-pin-head">${HouseSvg}</span><span class="hb-pin-tip"></span>`

  return wrap("hb-marker", button, onClick)
}

export function clusterElement(
  count: number,
  onClick: () => void,
): HTMLDivElement {
  const button = document.createElement("button")

  button.className = "hb-cluster"
  button.textContent = String(count)
  button.setAttribute("aria-label", `${count} events here, zoom in`)

  return wrap("hb-marker hb-marker-cluster", button, onClick)
}
