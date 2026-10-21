# Design

## Goals

1. **Process Caltrain's schedule in the cloud, on demand.** No cron job and
   no manual publish step: a request for the feed triggers the work when the
   cached copy has expired.
2. **Serve the same feed the apps already read,** from
   `https://next-caltrain-app.appspot.com/feed/schedule.json`, so it can be
   diffed against `https://next-caltrain-pwa.appspot.com/feed/schedule.json`.
3. **A web client that does what the iOS and Android apps do,** with tests,
   built with KendoReact.
4. **Learn the stack** this project is built around: FastAPI, SQLAlchemy and
   KendoReact. None of these would be our first choice here, which is part
   of the point.

## Non-goals

- Replacing next-caltrain-pwa's pipeline. It stays the production feed
  until this one has been diffed against it and trusted.
- Hand-maintained data. This feed is built from GTFS alone (see "Holiday
  schedule" below).

## Architecture

One App Engine (standard, Python) app, project `next-caltrain-app`, region
`us-west2`:

| Path | Served by | Caching |
|---|---|---|
| `/` and the web client's assets | Static files (`app.yaml` handlers) | App Engine's edge cache, like any static site |
| `/feed/schedule.json` | FastAPI | **Not** the edge cache: `Cache-Control: no-store` at the edge, Memcache inside the app |
| `/feed/csv/{schedule}_{direction}.csv` | FastAPI | Same as the feed |

The web client reads the feed over HTTP like any other client, so the
backend underneath (database, cache, framework) can change without touching
it.

## Request flow: transaction-based processing

There is no scheduled job. Each feed request does exactly as much work as
the state of the cache requires:

1. **Memcache has a snapshot that hasn't expired:** serve it.
2. **Memcache is empty** (evicted, or a new instance), but the database's
   current snapshot hasn't expired: serve that, and put it back in Memcache.
3. **The snapshot has expired** (or there is none yet): process now, in the
   request.
   - Download Caltrain's GTFS and read its `feed_version`.
   - **Same version as the current snapshot:** nothing to reload. Extend the
     snapshot's expiry to the next morning, and serve it.
   - **New version:** load the GTFS into the database under that version,
     build the feed from it, store the snapshot, then switch the "current
     snapshot" pointer to it. Serve the new snapshot.

A snapshot expires at **3:00 AM Pacific the morning after it was built or
last confirmed**. So the first request after 3:00 AM pays for a GTFS download
(a few seconds when the feed hasn't changed); everyone else that day gets the
cached copy. If nobody asks for a week, nothing runs for a week, and the
first request after that does the work.

### Decision: no "stale, please refresh" response

When the snapshot has expired, the request **waits** while the work is done.
We considered, and **chose not to**, serve the expired feed immediately with
a flag such as `"refresh": "retry in a minute"` while processing in the
background:

- Every client would need logic to notice the flag and retry, and that logic
  would get exercised rarely enough to rot.
- An expired feed is almost always identical to the new one (Caltrain
  changes its timetable a few times a year), so the flag would mostly
  announce nothing.
- The cost of waiting is paid by one request a day, and only by the first
  one. We accept that delay.

### Two requests at once

If two requests find the snapshot expired at the same moment, the first
takes a short-lived lock in Memcache (`add` with a TTL) and does the work.
The other waits for the result, then serves it. If the lock holder dies,
the lock's TTL runs out and the next request takes over. A duplicate load of
the same version is harmless, just wasted work (see "Atomic switch" below).

## Data model

GTFS rows are stored as they come, tagged with the feed version that brought
them:

| Kind | Key fields | Notes |
|---|---|---|
| `FeedVersion` | `version` | `feed_version` from `feed_info.txt`, download time, load status |
| `Stop` | `version`, `stop_id` | Station name, parent station, direction |
| `Trip` | `version`, `trip_id` | Train number, service ID, direction |
| `StopTime` | `version`, `trip_id`, `stop_sequence` | Arrival and departure times |
| `ServiceDate` | `version`, `service_id`, `date` | From `calendar.txt` and `calendar_dates.txt` |
| `Snapshot` | `version` | The generated feed JSON, `generated_at`, `expires_at` |
| `Current` | (one entity) | Points at the snapshot being served |

A Caltrain feed is about 5,900 rows (5,469 stop times, 261 trips, 107
stops), well within Datastore's free tier of 20,000 writes a day, even
though Caltrain republishes only a few times a year.

### Atomic switch

The `main` branch uses
[python-datastore-sqlalchemy](https://github.com/splasky/Python-datastore-sqlalchemy),
a SQLAlchemy dialect for Datastore. It supports SELECT, INSERT, UPDATE and
DELETE (including through the ORM), but **its transactions are no-ops**:
`begin()`, `commit()` and `rollback()` only log. It also has no joins, and it
writes one row per call.

So we never rely on the database for atomicity. A new version's rows are all
written first, under their own `version`, and nothing reads them yet. The
last step updates the single `Current` entity to point at the new snapshot.
One entity update is atomic in Datastore, so a reader sees either the old
feed or the new one, never a half-loaded mix. A failed load leaves orphaned
rows for that version, which the next load of that version replaces. This
same pattern is correct on Postgres too, where we'd also get a real
transaction around it.

Queries stay on one kind at a time (no joins); building the feed reads the
version's trips, stops and stop times and assembles them in Python.

## Feed format

The generated `schedule.json` keeps next-caltrain-pwa's format exactly:
`northStops`, `southStops`, `northWeekday` … `southHoliday`, `specialDates`
and `scheduleDate`, with `null` for stops a train skips. FastAPI's response
models (Pydantic) describe it as is; no translation is needed.

It adds:

- `generatedAt`: when this snapshot was built (ISO 8601)
- `expiresAt`: when the server will next check for a new GTFS (ISO 8601)
- `feedVersion`: Caltrain's `feed_version` string

Both apps ignore keys they don't know, so the extra fields are safe:
next-caltrain-swift decodes with `Codable` (`struct Schedule: Codable` in
`Sources/CaltrainSchedule.swift`), and next-caltrain-kotlin reads only the
keys it asks for from an `org.json` `JSONObject` (`Schedule.fromJson` in
`Schedule.kt`).

## Holiday schedule

This feed uses **GTFS only**. next-caltrain-pwa ships hand-maintained
holiday CSVs because GTFS disagrees with Caltrain's published Modified
Schedule PDF (see next-caltrain-pwa's `docs/HOLIDAY.md`). Here we
deliberately don't patch that, so:

- Diffing this feed against next-caltrain-pwa's shows exactly where GTFS and
  the published timetable disagree.
- The CSV endpoints (`/feed/csv/holiday_north.csv` and so on) turn the GTFS
  into the same human-readable tables next-caltrain-pwa keeps in `data/`,
  something we can hand to Caltrain staff along with the discrepancies.

## Caching

- **`main`:** App Engine's bundled Memcache. It's free, but it's set up by
  wrapping a WSGI app (`wrap_wsgi_app`), and FastAPI is ASGI. The plan is to
  run FastAPI behind an ASGI-to-WSGI adapter (`a2wsgi`). This is the first
  thing to prove works on App Engine.
- **`postgres` branch (later):** Memorystore for Memcached. It needs a
  Serverless VPC Access connector from App Engine standard, and both cost
  money, which fits a branch that already pays for Cloud SQL.

The database snapshot is the source of truth; Memcache only saves a database
read. Losing the cache costs one read, never a reprocessing.

## Branches

| Branch | Database | Cache | Status |
|---|---|---|---|
| `main` | Datastore through SQLAlchemy (python-datastore-sqlalchemy) | Bundled Memcache | Always deployed (free) |
| `datastore-native` | Datastore through `google-cloud-datastore` directly | Bundled Memcache | Later |
| `postgres` | Cloud SQL (Postgres) through the Cloud SQL Python Connector | Memorystore for Memcached | Later, deployed when needed |

On `postgres`, the connector is passed to SQLAlchemy as the engine's
connection factory (`create_engine("postgresql+pg8000://", creator=...)`).
`SQLALCHEMY_ENGINE_OPTIONS` is the Flask-SQLAlchemy name for the same idea;
with FastAPI it's plain `create_engine`.

If the Datastore dialect turns out to be too immature, `main` falls back to
`datastore-native`. The data model is simple enough that either works.

## Web client

React + TypeScript (Vite) with KendoReact's free components:

- Origin and destination stations (DropDownList), with a swap button
- Weekday, weekend and holiday schedules, defaulting to today's
- The next trains, in a Grid, with a countdown to the next departure
- A train's stops, when one is selected

The routing logic (direction, train times between two stops, South County
transfers at San Jose Diridon) is ported from next-caltrain-pwa's
`src/CaltrainService.js`, the reference implementation the Swift and Kotlin
apps follow. Its tests are ported too, with Vitest and React Testing
Library.

## Local development

- Python 3.13 to match App Engine's `python313` runtime (the Datastore dialect
  needs at least 3.11)
- The Datastore emulator (`gcloud components install cloud-datastore-emulator`,
  already installed here) for tests and local runs
- Node for the web client

## Open risks

1. **Memcache under FastAPI.** If the `a2wsgi` bridge doesn't work with
   `wrap_wsgi_app`, fall back to caching in each instance's memory, with the
   database snapshot behind it.
2. **The Datastore dialect** is young (v0.0.4, one maintainer). Fallback:
   `datastore-native`.
3. **Load time.** One write per row means a new feed version takes a few
   minutes to load. That's inside App Engine's 10-minute request limit, and
   it happens a few times a year. If it gets close to the limit, store each
   trip's stop times as one row instead of one row per stop.
