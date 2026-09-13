import ICAL from "ical.js"

interface ServerlessResponse {
  setHeader(name: string, value: string): void
  status(code: number): ServerlessResponse
  json(body: unknown): void
}

/**
 * Serverless counterpart of src/jobs/CalendarSync.ts. There is no disk to keep
 * a database on and no process to run a sync loop in, so the feed is parsed per
 * request and the response is cached at the edge instead.
 *
 * Keep the payload in sync with src/routes/events.json/_server.ts.
 */
export default async function handler(
  _request: unknown,
  response: ServerlessResponse,
) {
  const icalUrl = process.env.HOMEBASE_LIVE_ICAL

  if (!icalUrl) {
    response
      .status(500)
      .json({
        error: "HOMEBASE_LIVE_ICAL is not set",
      })

    return
  }

  try {
    const feed = await fetch(icalUrl)

    if (!feed.ok) {
      response
        .status(502)
        .json({
          error: `Calendar feed responded with ${feed.status}`,
        })

      return
    }

    const calendar = new ICAL.Component(ICAL.parse(await feed.text()))
    const events = calendar
      .getAllSubcomponents("vevent")
      .map(component => new ICAL.Event(component))
      .map(event => ({
        id: event.uid,
        title: event.summary,
        description: event.description ?? null,
        link: event.location ?? null,
        start: event.startDate.toJSDate().toISOString(),
        end: event.endDate.toJSDate().toISOString(),
        icalId: event.uid,
      }))

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    )
    response.json(events)
  } catch (error) {
    response
      .status(502)
      .json({
        error: `Could not read the calendar feed: ${error}`,
      })
  }
}
