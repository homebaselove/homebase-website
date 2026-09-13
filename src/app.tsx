/** @jsxImportSource preact */
import "./client.css"

import { ErrorBoundary, LocationProvider, Router } from "preact/iso"
import { RouteComponents } from "./routes/router.tsx"

export function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router>
          {RouteComponents}
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  )
}
