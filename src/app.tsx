/** @jsxImportSource preact */
import "./client.css"

import { ErrorBoundary, LocationProvider, Route, Router } from "preact/iso"
import { RouteComponents, Routes } from "./routes/router.tsx"

/** The site is one page: any other path shows it rather than nothing. */
const Home = Routes.find((route) => route.path === "/")?.component

export function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router>
          {RouteComponents}
          {Home && (
            <Route
              default
              component={Home}
            />
          )}
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  )
}
