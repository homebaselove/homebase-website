/** @jsxImportSource preact */
import { useEffect, useRef } from "preact"
import {
  effect,
  type ReadonlySignal,
  type Signal,
  useSignal,
} from "preact/signals"
import Supercluster, { type ClusterProperties } from "supercluster"
import { hasPin } from "../../map/event.ts"
import type { MapEvent } from "../../map/MapEvent.ts"
import { vendorPath } from "../../map/vendor.ts"
import { worldCamera } from "./camera.ts"
import { WorldControl } from "./controls.ts"
import {
  clusterElement,
  markerElement,
  previewElement,
  type Shape,
} from "./markers.ts"

type MapLibre = typeof import("maplibre-gl")

/** The OpenFreeMap light style: no key, no quotas, attribution added by MapLibre. */
const StyleUrl = "https://tiles.openfreemap.org/styles/positron"

let loading: Promise<MapLibre> | null = null

/** MapLibre comes from the vendored files, with its stylesheet, once. */
function loadMapLibre(): Promise<MapLibre> {
  loading ??= (async () => {
    const stylesheet = document.createElement("link")
    const styled = new Promise<void>((resolve) => {
      stylesheet.onload = () => resolve()
      stylesheet.onerror = () => resolve()
    })

    stylesheet.rel = "stylesheet"
    stylesheet.href = vendorPath("maplibre-gl.css")
    document.head.append(stylesheet)

    const module = (await import(vendorPath("maplibre-gl.mjs"))) as MapLibre

    await styled

    return module
  })()
  loading.catch(() => {
    loading = null
  })

  return loading
}

/** Past this zoom a cluster is the same place, so it opens instead of splitting. */
const SamePlaceZoom = 15

/** An event is shown no further out than this, a town and its surroundings. */
const EventZoom = 11

/** A move of more zoom levels than this flies, arcing out and back in, rather than easing. */
const FlightZooms = 3

/** How long the flight from the world down to an event takes. */
const FlightDuration = 1800

/** How long the flight back out to the world takes. */
const ReturnDuration = 1200

interface PinProperties {
  readonly slug: string
}

const isCluster = (
  properties: PinProperties | ClusterProperties,
): properties is ClusterProperties =>
  "cluster" in properties && properties.cluster === true

/** The height of a pin above its anchor, which the camera keeps clear of the top edge. */
const PinHeight = 44

/** Room beside the details card that is enough to show the pin there rather than above it. */
const BesideWidth = 200

/** From this zoom a marker is a pin on its spot; further out it is a round badge. */
const PinZoom = 7

/** Half a badge, which a preview sits above. */
const BadgeRadius = 26

/** How long a preview lingers after the pointer leaves it, so the pointer can reach it. */
const PreviewLinger = 160

interface Props {
  readonly events: ReadonlySignal<MapEvent[]>
  readonly selected: Signal<string | null>
  readonly hovered: Signal<string | null>
  /** The soonest upcoming event, whose marker wears a ring. */
  readonly next: ReadonlySignal<string | null>
  readonly onSelect: (slug: string) => void
  readonly onUnavailable: () => void
  /** Where the details card lies over the map, so the selected pin is kept out from under it. */
  readonly covered?: () => DOMRect | null
}

type State =
  | "waiting"
  | "loading"
  | "ready"
  | "unavailable"

/** Where the camera is: on the whole world, on an event, or wherever the viewer took it. */
type View =
  | "world"
  | "event"
  | "free"

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const state = useSignal<State>("waiting")

  useEffect(() => {
    const element = container.current

    if (!element) {
      return
    }

    let disposed = false
    let map: import("maplibre-gl").Map | null = null
    const stops: (() => void)[] = []

    const start = async () => {
      state.value = "loading"

      let lib: MapLibre

      try {
        lib = await loadMapLibre()
      } catch (error) {
        console.error("MapLibre did not load:", error)
        state.value = "unavailable"
        props.onUnavailable()

        return
      }

      if (disposed) {
        return
      }

      try {
        map = new lib.Map({
          container: element,
          style: StyleUrl,
          ...worldCamera(element.clientWidth),
          minZoom: -1,
          maxZoom: 17,
          // One world, edge to edge, rather than copies rolling in at the sides.
          renderWorldCopies: false,
          // A map seen from straight above: no tilt, and north stays up.
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: true,
          attributionControl: {
            compact: true,
          },
          locale: {
            "Map.Title": "Map of Homebase events",
          },
        })
      } catch (error) {
        console.error("The map could not start:", error)
        state.value = "unavailable"
        props.onUnavailable()

        return
      }

      const live = map
      const world = new WorldControl(() => overview(false))

      live.touchZoomRotate.disableRotation()
      live.keyboard.disableRotation()

      // A preview on hover, for pointers that hover; a finger goes straight to the card.
      const hoverable = typeof matchMedia === "function"
        && matchMedia("(hover: hover)").matches
      const preview = new lib.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        className: "hb-preview",
        maxWidth: "300px",
      })
      // The marker the preview is for, so a redraw that drops it closes the preview.
      let previewing: string | null = null
      let lingering: ReturnType<typeof setTimeout> | null = null

      const stayPreview = () => {
        if (lingering) {
          clearTimeout(lingering)
          lingering = null
        }
      }

      const hidePreview = () => {
        stayPreview()
        previewing = null
        preview.remove()
      }

      const lingerPreview = () => {
        stayPreview()
        lingering = setTimeout(hidePreview, PreviewLinger)
      }

      preview.on("open", () => {
        const panel = preview.getElement()

        panel.addEventListener("mouseenter", stayPreview)
        panel.addEventListener("mouseleave", lingerPreview)
      })

      const attachPreview = (
        wrapper: HTMLElement,
        key: string,
        lngLat: [number, number],
        slug: string | null,
        shape: Shape,
        content: () => [MapEvent[], number],
      ) => {
        wrapper.addEventListener("click", hidePreview)

        if (!hoverable) {
          return
        }

        wrapper.addEventListener("mouseenter", () => {
          stayPreview()

          if (slug) {
            props.hovered.value = slug
          }

          const [events, more] = content()

          if (events.length === 0) {
            return
          }

          previewing = key
          preview
            .setLngLat(lngLat)
            .setOffset(shape === "pin" ? PinHeight + 6 : BadgeRadius + 8)
            .setDOMContent(previewElement(events, more, props.next.peek()))

          if (!preview.isOpen()) {
            preview.addTo(live)
          }
        })
        wrapper.addEventListener("mouseleave", () => {
          if (slug && props.hovered.peek() === slug) {
            props.hovered.value = null
          }

          lingerPreview()
        })
      }

      live.addControl(
        new lib.NavigationControl({
          showCompass: false,
        }),
        "top-right",
      )
      live.addControl(world, "top-right")

      const index = new Supercluster<PinProperties, Record<never, never>>({
        radius: 48,
        maxZoom: SamePlaceZoom,
      })
      const markers = new Map<string, import("maplibre-gl").Marker>()
      // The events each marker stands for: one for a pin, all of them for a cluster.
      const members = new Map<string, string[]>()
      let known = new Map<string, MapEvent>()
      // The pins the index holds, so a list that only re-sorted does not reset
      // the view; null until the first list, which must load even when empty.
      let indexed: string | null = null
      // The pin the camera was last sent to, so a refreshed list does not send it again.
      let focused: string | null = null
      // The loaded() method of MapLibre is false whenever a tile is still on its way,
      // so readiness is the load event, which fires once.
      let ready = false
      let view: View = "free"
      // Set before each camera move of our own; a move that starts without it is the viewer taking over.
      let ours = false
      let lastWidth = element.clientWidth
      let lastHeight = element.clientHeight
      // The shape the markers on the map have; they are redrawn when the zoom crosses PinZoom.
      let shaped: Shape = "badge"

      /**
       * Where the camera is: told to the world button, and written on the
       * container for styles and tests once the camera has come to rest, so a
       * zoom read there is never one from the middle of a flight.
       */
      const describe = () => {
        if (live.isMoving()) {
          delete element.dataset.zoom
        } else {
          element.dataset.zoom = live.getZoom().toFixed(2)
        }

        element.dataset.view = view
        world.setAway(view !== "world")
      }

      const reflect = () => {
        const next = props.next.value

        for (const [key, marker] of markers) {
          const slug = key.startsWith("event:") ? key.slice(6) : null
          const element = marker.getElement()

          element.toggleAttribute(
            "data-selected",
            slug === props.selected.value,
          )
          element.toggleAttribute("data-hovered", slug === props.hovered.value)
          element.toggleAttribute(
            "data-next",
            next !== null && (members.get(key)?.includes(next) ?? false),
          )
        }
      }

      const render = () => {
        const shape: Shape = live.getZoom() >= PinZoom ? "pin" : "badge"

        if (shape !== shaped) {
          for (const marker of markers.values()) {
            marker.remove()
          }

          markers.clear()
          members.clear()
          shaped = shape
        }

        const bounds = live.getBounds()
        const clusters = index.getClusters(
          [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ],
          Math.floor(live.getZoom()),
        )
        const keep = new Set<string>()

        for (const feature of clusters) {
          const [lng, lat] = feature.geometry.coordinates
          const properties = feature.properties
          const key = isCluster(properties)
            ? `cluster:${properties.cluster_id}`
            : `event:${properties.slug}`

          keep.add(key)

          if (markers.has(key)) {
            continue
          }

          let element: HTMLElement

          if (isCluster(properties)) {
            const id = properties.cluster_id

            members.set(
              key,
              index
                .getLeaves(id, Infinity)
                .map((leaf) => leaf.properties.slug),
            )
            element = clusterElement(properties.point_count, () => {
              const zoom = index.getClusterExpansionZoom(id)

              if (zoom > SamePlaceZoom) {
                const [first] = index.getLeaves(id, 1)

                if (first) {
                  props.onSelect(first.properties.slug)

                  return
                }
              }

              move(
                [
                  lng,
                  lat,
                ],
                Math.min(zoom, SamePlaceZoom + 1),
                [
                  0,
                  0,
                ],
                false,
              )
            })
            attachPreview(
              element,
              key,
              [
                lng,
                lat,
              ],
              null,
              shape,
              () => {
                const events = index
                  .getLeaves(id, 3)
                  .map((leaf) => known.get(leaf.properties.slug))
                  .filter((found): found is MapEvent => found !== undefined)

                return [
                  events,
                  properties.point_count - events.length,
                ]
              },
            )
          } else {
            const event = known.get(properties.slug)

            if (!event) {
              continue
            }

            members.set(key, [
              event.slug,
            ])
            element = markerElement(
              event,
              shape,
              () => props.onSelect(event.slug),
            )
            attachPreview(
              element,
              key,
              [
                lng,
                lat,
              ],
              event.slug,
              shape,
              () => [
                [
                  event,
                ],
                0,
              ],
            )
          }

          markers.set(
            key,
            new lib.Marker({
              element,
              anchor: shape === "pin" ? "bottom" : "center",
              // Whole pixels make a marker stutter along a flight.
              subpixelPositioning: true,
            })
              .setLngLat([
                lng,
                lat,
              ])
              .addTo(live),
          )
        }

        for (const [key, marker] of markers) {
          if (!keep.has(key)) {
            marker.remove()
            markers.delete(key)
            members.delete(key)
          }
        }

        if (previewing && !keep.has(previewing)) {
          hidePreview()
        }

        reflect()
      }

      /** The world across the map, which is also as far out as the camera goes. */
      const floor = () => {
        const camera = worldCamera(element.clientWidth)

        // Raising the floor can move the camera up to it.
        ours = true
        live.setMinZoom(camera.zoom)
        ours = false

        return camera
      }

      /** Back out to the whole world, unless the camera is there or on its way. */
      const overview = (instant: boolean) => {
        const camera = floor()

        if (view === "world" && !instant) {
          return
        }

        view = "world"
        focused = null
        ours = true

        if (instant) {
          live.jumpTo(camera)
        } else {
          live.flyTo({
            ...camera,
            duration: ReturnDuration,
            minZoom: camera.zoom,
          })
        }

        describe()
      }

      /**
       * Sends the camera somewhere: at once, by easing when it is near, or by
       * flying when it is far, so coming in from the world arcs the way a real
       * flight would rather than zooming down a well.
       */
      const move = (
        center: [number, number],
        zoom: number,
        offset: [number, number],
        instant: boolean,
      ) => {
        ours = true

        if (instant) {
          live.easeTo({
            center,
            zoom,
            offset,
            duration: 0,
          })
        } else if (Math.abs(zoom - live.getZoom()) > FlightZooms) {
          live.flyTo({
            center,
            zoom,
            offset,
            duration: FlightDuration,
            minZoom: live.getMinZoom(),
          })
        } else {
          live.easeTo({
            center,
            zoom,
            offset,
          })
        }

        describe()
      }

      /**
       * The pixel offset that puts a pin in the part of the map the details
       * card leaves open: beside it when the map is wide enough, else above it.
       */
      const clearance = (): [number, number] => {
        const card = props.covered?.()
        const frame = element.getBoundingClientRect()

        if (!card || card.width === 0) {
          return [
            0,
            PinHeight / 2,
          ]
        }

        if (frame.right - card.right >= BesideWidth) {
          return [
            (card.right - frame.left) / 2,
            PinHeight / 2,
          ]
        }

        return [
          0,
          (card.top - frame.bottom) / 2 + PinHeight / 2,
        ]
      }

      /** Whether the pin stands on its own at a zoom, rather than inside a cluster. */
      const alone = (
        event: MapEvent & {
          lat: number
          lng: number
        },
        zoom: number,
      ) =>
        index
          .getClusters(
            [
              event.lng - 1e-7,
              event.lat - 1e-7,
              event.lng + 1e-7,
              event.lat + 1e-7,
            ],
            Math.floor(zoom),
          )
          .some((found) =>
            !isCluster(found.properties) && found.properties.slug === event.slug
          )

      const focus = (
        event: MapEvent & {
          lat: number
          lng: number
        },
        instant: boolean,
      ) => {
        let zoom = Math.max(live.getZoom(), EventZoom)

        // Close enough that the pin is its own marker; the events of one venue stack past SamePlaceZoom.
        while (zoom <= SamePlaceZoom && !alone(event, zoom)) {
          zoom += 1
        }

        focused = event.slug
        view = "event"

        // The card renders after this signal settles, and the camera needs its size.
        requestAnimationFrame(() => {
          if (disposed) {
            return
          }

          move(
            [
              event.lng,
              event.lat,
            ],
            zoom,
            clearance(),
            instant,
          )
        })
      }

      const settle = (instant: boolean) => {
        const slug = props.selected.peek()
        const event = slug ? known.get(slug) : undefined

        if (event && hasPin(event)) {
          focus(event, instant)
        } else {
          overview(instant)
        }
      }

      live.on("load", () => {
        ready = true
        state.value = "ready"
        settle(true)
        render()
      })
      live.on("movestart", () => {
        // A move we did not start, and that is not the map fitting a new size,
        // is the viewer taking the camera: a drag, a wheel, a pinch, a key or a
        // zoom button.
        const resized = element.clientWidth !== lastWidth
          || element.clientHeight !== lastHeight

        lastWidth = element.clientWidth
        lastHeight = element.clientHeight

        if (!ours && !resized) {
          view = "free"
        }

        ours = false
        describe()
      })
      live.on("moveend", () => {
        render()
        describe()
      })
      live.on("resize", () => {
        const camera = floor()

        if (view === "world") {
          ours = true
          live.jumpTo(camera)
        }
      })

      stops.push(
        effect(() => {
          const list = props.events.value

          known = new Map(list.map((event) => [
            event.slug,
            event,
          ]))

          const pins = list
            .filter(hasPin)
            .map((event) => `${event.slug}@${event.lat},${event.lng}`)
            .join(" ")

          if (pins === indexed) {
            return
          }

          indexed = pins
          index.load(
            list.filter(hasPin).map((event) => ({
              type: "Feature" as const,
              properties: {
                slug: event.slug,
              },
              geometry: {
                type: "Point" as const,
                coordinates: [
                  event.lng,
                  event.lat,
                ],
              },
            })),
          )

          if (ready) {
            for (const marker of markers.values()) {
              marker.remove()
            }

            markers.clear()
            members.clear()
            settle(false)
            render()
          }
        }),
      )
      stops.push(
        effect(() => {
          const slug = props.selected.value
          const event = slug ? known.get(slug) : undefined

          reflect()

          if (!slug) {
            focused = null

            if (ready) {
              overview(false)
            }
          } else if (event && hasPin(event) && ready && slug !== focused) {
            focus(event, false)
          }
        }),
      )
      stops.push(
        effect(() => {
          props.hovered.value
          props.next.value
          reflect()
        }),
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          start()
        }
      },
      {
        rootMargin: "200px",
      },
    )

    observer.observe(element)

    return () => {
      disposed = true
      observer.disconnect()
      stops.forEach((stop) => stop())
      map?.remove()
    }
  }, [])

  return (
    <div class="absolute inset-0">
      {/* Sized in full rather than absolutely: the MapLibre stylesheet positions the container itself. */}
      <div
        ref={container}
        class="w-full h-full bg-gray-100"
      />

      {state.value !== "ready" && state.value !== "unavailable" && (
        <div
          class="absolute inset-0 animate-pulse bg-gray-100"
          aria-hidden="true"
        />
      )}

      {state.value === "unavailable" && (
        <div class="absolute inset-0 flex items-center justify-center p-6 text-center text-gray-600 bg-gray-50">
          <p>
            The map can’t draw in this browser, but every event is in the list.
          </p>
        </div>
      )}
    </div>
  )
}
