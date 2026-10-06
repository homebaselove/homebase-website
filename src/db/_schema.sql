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
