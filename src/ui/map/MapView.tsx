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
import { clusterElement, markerElement } from "./markers.ts"

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

interface Props {
  readonly events: ReadonlySignal<MapEvent[]>
  readonly selected: Signal<string | null>
  readonly hovered: Signal<string | null>
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
          center: [
            10,
            25,
          ],
          zoom: 1.3,
          minZoom: 1,
          maxZoom: 17,
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

      live.addControl(
        new lib.NavigationControl({
          showCompass: false,
        }),
        "top-right",
      )

      const index = new Supercluster<PinProperties, Record<never, never>>({
        radius: 48,
        maxZoom: SamePlaceZoom,
      })
      const markers = new Map<string, import("maplibre-gl").Marker>()
      let known = new Map<string, MapEvent>()
      // The pins the index holds, so a list that only re-sorted does not reset the view.
      let indexed = String()
      // The pin the camera was last sent to, so a refreshed list does not send it again.
      let focused: string | null = null
      // The loaded() method of MapLibre is false whenever a tile is still on its way,
      // so readiness is the load event, which fires once.
      let ready = false

      const reflect = () => {
        for (const [key, marker] of markers) {
          const slug = key.startsWith("event:") ? key.slice(6) : null
          const element = marker.getElement()

          element.toggleAttribute(
            "data-selected",
            slug === props.selected.value,
          )
          element.toggleAttribute("data-hovered", slug === props.hovered.value)
        }
      }

      const render = () => {
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

            element = clusterElement(properties.point_count, () => {
              const zoom = index.getClusterExpansionZoom(id)

              if (zoom > SamePlaceZoom) {
                const [first] = index.getLeaves(id, 1)

                if (first) {
                  props.onSelect(first.properties.slug)

                  return
                }
              }

              live.easeTo({
                center: [
                  lng,
                  lat,
                ],
                zoom: Math.min(zoom, SamePlaceZoom + 1),
              })
            })
          } else {
            const event = known.get(properties.slug)

            if (!event) {
              continue
            }

            element = markerElement(event, () => props.onSelect(event.slug))
          }

          markers.set(
            key,
            new lib.Marker({
              element,
              anchor: key.startsWith("cluster:") ? "center" : "bottom",
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
          }
        }

        reflect()
      }

      const fit = () => {
        const pins = [
          ...known.values(),
        ]
          .filter(hasPin)

        if (pins.length === 0) {
          return
        }

        if (pins.length === 1) {
          live.easeTo({
            center: [
              pins[0].lng,
              pins[0].lat,
            ],
            zoom: 10,
          })

          return
        }

        const bounds = new lib.LngLatBounds(
          [
            pins[0].lng,
            pins[0].lat,
          ],
          [
            pins[0].lng,
            pins[0].lat,
          ],
        )

        for (const pin of pins) {
          bounds.extend([
            pin.lng,
            pin.lat,
          ])
        }

        live.fitBounds(bounds, {
          // a pin stands on its anchor, so the top needs its height on top of the margin
          padding: {
            top: 96,
            bottom: 64,
            left: 64,
            right: 64,
          },
          maxZoom: 12,
          duration: 700,
        })
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
      ) => {
        let zoom = Math.max(live.getZoom(), 11)

        // Close enough that the pin is its own marker; the events of one venue stack past SamePlaceZoom.
        while (zoom <= SamePlaceZoom && !alone(event, zoom)) {
          zoom += 1
        }

        focused = event.slug

        // The card renders after this signal settles, and the camera needs its size.
        requestAnimationFrame(() => {
          if (disposed) {
            return
          }

          live.easeTo({
            center: [
              event.lng,
              event.lat,
            ],
            zoom,
            offset: clearance(),
          })
        })
      }

      const settle = () => {
        const slug = props.selected.peek()
        const event = slug ? known.get(slug) : undefined

        if (event && hasPin(event)) {
          focus(event)
        } else {
          fit()
        }
      }

      live.on("load", () => {
        ready = true
        state.value = "ready"
        settle()
        render()
      })
      live.on("moveend", render)

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
            settle()
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
          } else if (event && hasPin(event) && ready && slug !== focused) {
            focus(event)
          }
        }),
      )
      stops.push(
        effect(() => {
          props.hovered.value
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
