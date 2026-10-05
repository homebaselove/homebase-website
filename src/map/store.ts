/**
 * Where pins and sign-ins live. The SQL is SQLite's, which libSQL speaks too,
 * so one set of statements serves the Bun server's database file and the
 * hosted database the Vercel functions reach over HTTP. Each deploy wraps its
 * client in a Store, which only runs a statement and hands back rows.
 */
import { Schema as S } from "effect"
import { MapEvent } from "./MapEvent.ts"

export type Param =
  | string
  | number
  | null

export type Row = Record<string, unknown>

export interface Store {
  readonly run: (
    sql: string,
    params?: readonly Param[],
  ) => Promise<readonly Row[]>
}

/** Every statement is idempotent, so a deploy can run them at any start. */
export const Tables = [
  `create table if not exists "MapEvent" (
  "slug" text primary key,
  "lumaId" text,
  "url" text not null,
  "title" text not null,
  "description" text,
  "start" text not null,
  "end" text,
  "timezone" text,
  "venue" text,
  "address" text,
  "city" text,
  "lat" real,
  "lng" real,
  "placement" text not null,
  "cover" text,
  "hosts" text not null,
  "calendar" text,
  "status" text not null,
  "addedBy" text not null,
  "addedAt" text not null,
  "checkedAt" text not null
)`,
  `create unique index if not exists "MapEvent_lumaId_idx"
on "MapEvent" ("lumaId")
where "lumaId" is not null`,
  `create index if not exists "MapEvent_start_idx"
on "MapEvent" ("start")`,
  `create table if not exists "AuthNonce" (
  "nonce" text primary key,
  "address" text not null,
  "domain" text not null,
  "expiresAt" text not null
)`,
  `create table if not exists "AuthSession" (
  "tokenHash" text primary key,
  "address" text not null,
  "role" text not null,
  "expiresAt" text not null,
  "createdAt" text not null
)`,
]

export async function ensureSchema(store: Store): Promise<void> {
  for (const statement of Tables) {
    await store.run(statement)
  }
}

const EventColumns = [
  "slug",
  "lumaId",
  "url",
  "title",
  "description",
  "start",
  "end",
  "timezone",
  "venue",
  "address",
  "city",
  "lat",
  "lng",
  "placement",
  "cover",
  "hosts",
  "calendar",
  "status",
  "addedBy",
  "addedAt",
  "checkedAt",
] as const

const quoted = (column: string) => `"${column}"`

const decodeEvent = S.decodeUnknownSync(MapEvent)

function toEvent(row: Row): MapEvent {
  return decodeEvent({
    ...row,
    hosts: typeof row.hosts === "string" ? JSON.parse(row.hosts) : [],
  })
}

function toParams(event: MapEvent): Param[] {
  return EventColumns.map((column) => {
    const value = event[column]

    return column === "hosts" ? JSON.stringify(value) : (value as Param)
  })
}

export async function listEvents(store: Store): Promise<MapEvent[]> {
  const rows = await store.run(
    `select * from "MapEvent" where "status" = 'live' order by "start"`,
  )

  return rows.map(toEvent)
}

export async function getEvent(
  store: Store,
  slug: string,
): Promise<MapEvent | null> {
  const rows = await store.run(`select * from "MapEvent" where "slug" = ?`, [
    slug,
  ])

  return rows.length ? toEvent(rows[0]) : null
}

/**
 * Writes an event in, replacing what the same slug held. An organizer can
 * rename an event's link, so a pin that carries the same Luma id under an
 * older slug goes first.
 */
export async function putEvent(
  store: Store,
  event: MapEvent,
): Promise<MapEvent> {
  if (event.lumaId) {
    await store.run(
      `delete from "MapEvent" where "lumaId" = ? and "slug" <> ?`,
      [
        event.lumaId,
        event.slug,
      ],
    )
  }

  const updates = EventColumns
    .filter((column) =>
      column !== "slug" && column !== "addedBy" && column !== "addedAt"
    )
    .map((column) => `${quoted(column)} = excluded.${quoted(column)}`)
  const rows = await store.run(
    `insert into "MapEvent" (${EventColumns.map(quoted).join(", ")})
values (${EventColumns.map(() => "?").join(", ")})
on conflict ("slug") do update set ${updates.join(", ")}
returning *`,
    toParams(event),
  )

  return toEvent(rows[0])
}

export async function removeEvent(
  store: Store,
  slug: string,
): Promise<boolean> {
  const rows = await store.run(
    `delete from "MapEvent" where "slug" = ? returning "slug"`,
    [
      slug,
    ],
  )

  return rows.length > 0
}

export async function markGone(
  store: Store,
  slug: string,
  checkedAt: string,
): Promise<void> {
  await store.run(
    `update "MapEvent" set "status" = 'gone', "checkedAt" = ? where "slug" = ?`,
    [
      checkedAt,
      slug,
    ],
  )
}

export async function touchEvent(
  store: Store,
  slug: string,
  checkedAt: string,
): Promise<void> {
  await store.run(`update "MapEvent" set "checkedAt" = ? where "slug" = ?`, [
    checkedAt,
    slug,
  ])
}

/** Live events not read since checkedBefore that have not long ended. */
export async function staleEvents(
  store: Store,
  options: {
    readonly checkedBefore: string
    readonly endedAfter: string
    readonly limit: number
  },
): Promise<MapEvent[]> {
  const rows = await store.run(
    `select * from "MapEvent"
where "status" = 'live'
  and "checkedAt" < ?
  and coalesce("end", "start") >= ?
order by "checkedAt"
limit ?`,
    [
      options.checkedBefore,
      options.endedAfter,
      options.limit,
    ],
  )

  return rows.map(toEvent)
}

export interface Nonce {
  readonly nonce: string
  readonly address: string
  readonly domain: string
  readonly expiresAt: string
}

export async function insertNonce(store: Store, nonce: Nonce): Promise<void> {
  await store.run(
    `insert into "AuthNonce" ("nonce", "address", "domain", "expiresAt") values (?, ?, ?, ?)`,
    [
      nonce.nonce,
      nonce.address,
      nonce.domain,
      nonce.expiresAt,
    ],
  )
}

/** Takes a nonce out, so it can be used once; nothing comes back for a used or expired one. */
export async function consumeNonce(
  store: Store,
  nonce: string,
  now: string,
): Promise<Nonce | null> {
  const rows = await store.run(
    `delete from "AuthNonce" where "nonce" = ? and "expiresAt" > ? returning *`,
    [
      nonce,
      now,
    ],
  )

  return rows.length ? (rows[0] as unknown as Nonce) : null
}

export async function purgeNonces(store: Store, now: string): Promise<void> {
  await store.run(`delete from "AuthNonce" where "expiresAt" <= ?`, [
    now,
  ])
}

export interface Session {
  readonly tokenHash: string
  readonly address: string
  readonly role: string
  readonly expiresAt: string
  readonly createdAt: string
}

export async function insertSession(
  store: Store,
  session: Session,
): Promise<void> {
  await store.run(
    `insert into "AuthSession" ("tokenHash", "address", "role", "expiresAt", "createdAt") values (?, ?, ?, ?, ?)`,
    [
      session.tokenHash,
      session.address,
      session.role,
      session.expiresAt,
      session.createdAt,
    ],
  )
}

export async function findSession(
  store: Store,
  tokenHash: string,
  now: string,
): Promise<Session | null> {
  const rows = await store.run(
    `select * from "AuthSession" where "tokenHash" = ? and "expiresAt" > ?`,
    [
      tokenHash,
      now,
    ],
  )

  return rows.length ? (rows[0] as unknown as Session) : null
}

export async function deleteSession(
  store: Store,
  tokenHash: string,
): Promise<void> {
  await store.run(`delete from "AuthSession" where "tokenHash" = ?`, [
    tokenHash,
  ])
}

export async function purgeSessions(store: Store, now: string): Promise<void> {
  await store.run(`delete from "AuthSession" where "expiresAt" <= ?`, [
    now,
  ])
}

/** The shape of @libsql/client, which the Vercel functions reach Turso through. */
export interface LibsqlLike {
  execute(statement: {
    sql: string
    args: Param[]
  }): Promise<{
    columns: string[]
    rows: ArrayLike<unknown>[]
  }>
}

export function libsqlStore(client: LibsqlLike): Store {
  return {
    run: async (sql, params = []) => {
      const result = await client.execute({
        sql,
        args: [
          ...params,
        ],
      })

      return result.rows.map((row) =>
        Object.fromEntries(
          result.columns.map((column, index) => [
            column,
            row[index],
          ]),
        )
      )
    },
  }
}
