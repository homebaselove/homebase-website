/** @jsxImportSource preact */
import { useEffect, useState } from "preact"

interface Event {
  id: string
  title: string
  description: string
  link: string | null
  start: string
  end: string
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/events.json")
      .then(res => res.json())
      .then(data => {
        setEvents(data)
        setLoading(false)
      })
      .catch(err => {
        console.error("Error fetching events:", err)
        setLoading(false)
      })
  }, [])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    }
  }

  const formatDuration = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const startFormatted = formatDateTime(start)
    const endFormatted = formatDateTime(end)

    // If same day, just show end time
    if (startDate.toDateString() === endDate.toDateString()) {
      return `${startFormatted.date} • ${startFormatted.time} - ${endFormatted.time}`
    }

    return `${startFormatted.date} ${startFormatted.time} - ${endFormatted.date} ${endFormatted.time}`
  }

  if (loading) {
    return (
      <div class="flex flex-col w-full max-w-[1140px] mx-auto z-10 mt-20">
        <div class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand">
          </div>
          <span class="ml-3 text-gray-600">
            Loading events...
          </span>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div class="flex flex-col w-full max-w-[1140px] mx-auto z-10 mt-20">
        <div class="text-center py-12">
          <div class="text-6xl mb-4">
            📅
          </div>
          <h2 class="text-2xl font-semibold text-gray-800 mb-2">
            No Events Scheduled
          </h2>
          <p class="text-gray-600">
            Check back later for upcoming events!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div class="flex flex-col w-full max-w-[1140px] mx-auto z-10 mt-20 px-4">
      <div class="mb-8">
        <h1 class="text-4xl font-bold text-gray-900 mb-2">
          Upcoming Events
        </h1>
        <p class="text-gray-600">
          Stay updated with our latest happenings
        </p>
      </div>

      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div
            key={event.id}
            class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-100 overflow-hidden"
          >
            <div class="p-6">
              <div class="flex items-start justify-between mb-4">
                <h3 class="text-xl font-semibold text-gray-900 leading-tight">
                  {event.title}
                </h3>
                <div class="flex-shrink-0 ml-2">
                  <div class="w-2 h-2 bg-brand rounded-full">
                  </div>
                </div>
              </div>

              {event.description && (
                <p class="text-gray-600 mb-4 line-clamp-3 leading-relaxed">
                  {event.description}
                </p>
              )}

              <div class="flex items-center text-sm text-gray-500 mb-4">
                <svg
                  class="w-4 h-4 mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span class="leading-tight">
                  {formatDuration(event.start, event.end)}
                </span>
              </div>

              {event.link && (
                <div class="pt-4 border-t border-gray-100">
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center text-brand hover:text-brand-dark font-medium transition-colors duration-200"
                  >
                    <span>
                      Learn More
                    </span>
                    <svg
                      class="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
