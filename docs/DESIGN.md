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

- Replacing the pipeline in next-caltrain-pwa. It stays the production feed
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

| Table | Key | Notes |
|---|---|---|
| `feed_version` | `version` | `feed_version` from `feed_info.txt`, download time, load status |
| `stop` | `version`, `stop_id` | Station name, parent station, direction |
| `trip` | `version`, `trip_id` | Train number, service ID, direction |
| `stop_time` | `version`, `trip_id`, `stop_sequence` | Arrival and departure times |
| `service_date` | `version`, `service_id`, `date` | From `calendar.txt` and `calendar_dates.txt` |
| `snapshot` | `version` | The generated feed JSON, `generated_at`, `expires_at` |
| `current` | (one row) | Points at the snapshot being served |

A Caltrain feed is about 5,900 rows (5,469 stop times, 261 trips, 107
stops), and Caltrain republishes only a few times a year.

### Atomic switch

A new version's rows are all written first, under their own `version`, and
nothing reads them yet. The last step updates the single `current` row to
point at the new snapshot, so a reader sees either the old feed or the new
one, never a half-loaded mix. On Postgres the whole load is also one
transaction, but the design doesn't depend on that: the same pattern is
correct on Datastore, where a single entity update is atomic and
multi-entity transactions are limited. That keeps the planned move to
Datastore (see "Database" below) a change of storage code, not of design.

For the same reason, queries stay simple: building the feed reads one
version's trips, stops and stop times and assembles them in Python, rather
than leaning on joins Datastore doesn't have.

## Feed format

The generated `schedule.json` keeps next-caltrain-pwa's format exactly:
`northStops`, `southStops`, `northWeekday` … `southHoliday`, `specialDates`
and `scheduleDate`, with `null` for stops a train skips. FastAPI's response
models (Pydantic) describe it as is; no translation is needed.

It adds:

- `generatedAt`: when this snapshot was built (ISO 8601)
- `expiresAt`: when the server will next check for a new GTFS (ISO 8601)
- `feedVersion`: Caltrain's `feed_version` string

Both apps ignore keys they don't know, so the extra fields are safe. The
iOS app (next-caltrain-swift) decodes with `Codable` (`struct Schedule:
Codable` in `Sources/CaltrainSchedule.swift`), and the Android app
(next-caltrain-kotlin) reads only the keys it asks for from an `org.json`
`JSONObject` (`Schedule.fromJson` in `Schedule.kt`).

## Holiday schedule

This feed uses **GTFS only**. The next-caltrain-pwa project ships
hand-maintained holiday CSVs because GTFS disagrees with Caltrain's published
Modified Schedule PDF (see its `docs/HOLIDAY.md`). Here we deliberately don't
patch that, so:

- Diffing this feed against next-caltrain-pwa's shows exactly where GTFS and
  the published timetable disagree.
- The CSV endpoints (`/feed/csv/holiday_north.csv` and so on) turn the GTFS
  into the same human-readable tables next-caltrain-pwa keeps in `data/`,
  something we can hand to Caltrain staff along with the discrepancies.

## Database

**For now:** Cloud SQL for PostgreSQL 17, instance `next-caltrain-db`, the
smallest shared-core size (`db-f1-micro`, Enterprise edition), one zone in
`us-west2`, 10 GB of HDD storage, no automated backups (the data can always
be rebuilt from GTFS). It costs about $9–11 a month.

That's a temporary choice, made to learn SQLAlchemy against a real
relational database. The plan is to move to Datastore, which is free, once
that's done:

- **Postgres** is reached through the Cloud SQL Python Connector, passed to
  SQLAlchemy as the engine's connection factory:
  `create_engine("postgresql+pg8000://", creator=getconn)`.
  (`SQLALCHEMY_ENGINE_OPTIONS` is the Flask-SQLAlchemy name for the same
  idea; with FastAPI it's plain `create_engine`.)
- **No database passwords:** the connector uses IAM database
  authentication. App Engine's service account is a database user, and so
  is Woodie's Google account for local work.
- **Datastore** (later) uses `google-cloud-datastore` directly. The free
  Datastore-mode database already exists in the project, empty.

We tried and dropped
[python-datastore-sqlalchemy](https://github.com/splasky/Python-datastore-sqlalchemy),
a SQLAlchemy dialect for Datastore. It supports SELECT, INSERT, UPDATE and
DELETE (including through the ORM), but its transactions are no-ops
(`begin()`, `commit()` and `rollback()` only log), it has no joins, and it
writes one row per call. Going through SQLAlchemy to reach Datastore would
hide Datastore's real model without giving us SQLAlchemy's.

## Caching

App Engine's bundled Memcache. It's free, but it's set up by wrapping a WSGI
app (`wrap_wsgi_app`), and FastAPI is ASGI. The plan is to run FastAPI behind
an ASGI-to-WSGI adapter (`a2wsgi`). This is the first thing to prove works on
App Engine.

Memorystore for Memcached is the managed alternative, but from App Engine
standard it needs a Serverless VPC Access connector, and both cost money.
Not worth it for one small JSON document.

The database snapshot is the source of truth; Memcache only saves a database
read. Losing the cache costs one read, never a reprocessing.

## Web client

React + TypeScript (Vite) with KendoReact's free components, cloning the iOS
and Android apps' screens and touch behavior:

| Where | Gesture | What it does |
|---|---|---|
| Home: the title | Tap | Opens About |
| Home and trip list: the station names | Tap | Opens station selection |
| Home: the circle | Tap | Opens the trip list |
| Home: the circle | Vertical drag | Steps the selected trip |
| Trip list: the status line | Tap | Cycles the schedule: weekday, weekend, holiday |
| Trip list: a row | Tap | Opens that train's stops |
| Trip list: the rows | Vertical drag | Steps the selected trip |
| Station selection | Tap a station | Picks it |
| Header buttons | Tap | Swap direction; reset a manual selection |

**Stepping, not scrolling.** The trip list doesn't scroll. It draws a fixed
set of rows and, as you drag, moves the selection by one row for every
row-height of movement (kept within the day's trips), then redraws the
rows' contents. The home circle does the same with its one visible trip.
This matches the apps' `DragGesture` handlers (`HomeView.swift`,
`TripListView.swift`) and the PWA's fixed trip cards. Kendo's Grid scrolls
its rows natively, so the trip list is a custom row layout built with
KendoReact pieces, not a stock Grid.

**Drag versus tap:** after a drag on the trip list ends, taps are ignored
for 0.2 seconds, so letting go of a drag doesn't also open a train.

The routing logic (direction, train times between two stops, South County
transfers at San Jose Diridon) is ported from next-caltrain-pwa's
`src/CaltrainService.js`, the reference implementation the Swift and Kotlin
apps follow. Its tests are ported too, with Vitest and React Testing
Library.

## Tests

**The same specs, with the same output, as the Swift and Kotlin apps.**
The next-caltrain-swift and next-caltrain-kotlin repos keep their five spec
files (`CaltrainScheduleSpec`, `CaltrainServiceSpec`, `GoodTimesSpec`,
`ScheduleSpec`, `TripViewModelSpec`) line for line identical in their
describe/context/it text. The only differences are real implementation
differences, written in each language's own terms: method names (Swift's
`.direction(from:to:stops:)` versus Kotlin's `.direction()`) and constants
(Swift's `.weekday` versus Kotlin's `WEEKDAY`). The web client's specs follow
the same rule: the same five files, the same tree, and TypeScript's own
names only where the TypeScript code genuinely differs. A script that
extracts the describe/context/it text from all three repos and diffs it
keeps them honest.

The backend's specs cover new code (loading GTFS, building the feed), so
there's nothing to mirror there, but where the backend repeats an app
concept (train types, the schedule-day boundary, special dates), it uses the
apps' names for it.

- **Python:** [Mamba](https://github.com/nestorsalceda/mamba) with the
  `expects` matchers, for RSpec-style `description`/`context`/`it` blocks
  and nested documentation output. It runs on Python 3.13, but it's
  unmaintained since its 0.11.3 release in November 2023, and it works by
  rewriting test files' syntax trees, which a future Python could break.
  Its documentation output prefixes each example with "it", unlike the
  xctidy and kotidy trees the apps print; a small custom Mamba formatter
  can match their style.
- **Web client:** Vitest with its tree reporter, and `justBeforeEach` from
  [penultimate](https://github.com/woodie/penultimate), as in
  next-caltrain-pwa. The Swift and Kotlin specs use `justBeforeEach` (Quick
  and kwick) the same way.

## Local development

- Python 3.13 to match App Engine's `python313` runtime
- Postgres in Docker for tests and local runs, so tests never touch Cloud
  SQL
- Node for the web client

## Open risks

1. **Memcache under FastAPI.** If the `a2wsgi` bridge doesn't work with
   `wrap_wsgi_app`, fall back to caching in each instance's memory, with the
   database snapshot behind it.
2. **Mamba's future.** If it breaks on a new Python, pytest is the fallback;
   the test structure (nested contexts with one scenario each) carries over.
3. **Cloud SQL's cost,** about $10 a month. Accepted for a few months, until
   the move to Datastore.
