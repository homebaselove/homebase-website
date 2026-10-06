CREATE TABLE IF NOT EXISTS "_Migration" (
  migration_id integer PRIMARY KEY NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp,
  name VARCHAR(255) NOT NULL
);


CREATE TABLE IF NOT EXISTS "Event" (
  "id" text primary key,
  "title" text not null,
  "description" text,
  "link" text,
  "start" text not null,
  "end" text not null,
  "icalId" text
);


INSERT INTO
  _Migration
VALUES
  (2506110515, '2025-06-25 19:19:08', 'CreateEvent');


CREATE TABLE IF NOT EXISTS "MapEvent" (
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
);


CREATE UNIQUE INDEX IF NOT EXISTS "MapEvent_lumaId_idx" ON "MapEvent" ("lumaId")
WHERE
  "lumaId" IS NOT NULL;


CREATE INDEX IF NOT EXISTS "MapEvent_start_idx" ON "MapEvent" ("start");


CREATE TABLE IF NOT EXISTS "AuthNonce" (
  "nonce" text primary key,
  "address" text not null,
  "domain" text not null,
  "expiresAt" text not null
);


CREATE TABLE IF NOT EXISTS "AuthSession" (
  "tokenHash" text primary key,
  "address" text not null,
  "role" text not null,
  "expiresAt" text not null,
  "createdAt" text not null
);


INSERT INTO
  _Migration
VALUES
  (2610050500, '2026-10-05 05:00:00', 'CreateMap');
