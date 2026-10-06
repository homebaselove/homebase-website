/**
 * The button that brings the whole world back. It lives in a MapLibre control
 * group under the zoom buttons, so it looks like one of them, and it only
 * shows once the camera has left the world.
 */
import type { IControl } from "maplibre-gl"

const WorldIcon =
  `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.25"/><ellipse cx="10" cy="10" rx="3" ry="7.25"/><path d="M2.75 10h14.5M4.1 6.3h11.8M4.1 13.7h11.8"/></svg>`

export class WorldControl implements IControl {
  private container: HTMLDivElement | null = null

  constructor(private readonly onPress: () => void) {}

  onAdd(): HTMLElement {
    const container = document.createElement("div")
    const button = document.createElement("button")

    container.className = "maplibregl-ctrl maplibregl-ctrl-group hb-world"
    button.type = "button"
    button.className = "hb-world-button"
    button.title = "Whole world"
    button.setAttribute("aria-label", "Show the whole world")
    button.innerHTML = WorldIcon
    button.addEventListener("click", () => this.onPress())
    container.append(button)
    this.container = container

    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = null
  }

  /** Shown away from the world, hidden on it. */
  setAway(away: boolean): void {
    this.container?.toggleAttribute("data-away", away)
  }
}
