import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { Tables } from "../../map/store.ts"

/** The map's tables, which the Vercel functions create the same way on first use. */
export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  for (const statement of Tables) {
    yield* sql.unsafe(statement)
  }
})
