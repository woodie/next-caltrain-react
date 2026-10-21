# Picking up next-caltrain-react in a new Cowork session

Cross-project conventions (git, branches and PRs, Makefile targets, test
structure, comments, prose) are in `~/workspace/woodie/docs/COWORK.md`.

## What this is

A cloud rebuild of the Next Caltrain schedule pipeline, plus a web clone of
the iOS and Android apps:

- **Backend:** FastAPI on App Engine standard (Python 3.13), with SQLAlchemy
  over Datastore. It builds `schedule.json` from Caltrain's GTFS on demand
  and caches it until 3:00 AM Pacific the next morning.
- **Web client:** React + TypeScript with KendoReact, reading the same feed
  the apps read.

The full design is in `docs/DESIGN.md`. This file covers why the project
exists, how it got set up, and what a new session needs to know.

## Why this stack

Woodie got a job lead whose stack is Python (Flask/FastAPI/SQLAlchemy),
React with Kendo UI, a database, and TypeScript. He already knows older
Python and Flask well (from Google, internal), React and TypeScript, and
relational databases (20+ years). The new parts, and the reason for this
repo, are **FastAPI, SQLAlchemy 2.0 and KendoReact**.

None of these would be our choice for this problem. Building a real thing
with them anyway is the point, and the React client should outlive the
experiment: it only depends on the feed, so the backend underneath can be
swapped (see "Branches" in `docs/DESIGN.md`).

Don't explain SQL, schema design, React, TypeScript or Flask basics. Do
explain FastAPI idioms (dependencies, Pydantic models, async), SQLAlchemy
2.0 specifics (typed `Mapped` models, sessions, loading strategies,
Alembic) and KendoReact's components and licensing.

## How this got here

The same session (2026-10-20) also reworked next-caltrain-pwa, which this
project mirrors:

- The PWA stopped baking schedule data into its bundle and now fetches
  `/feed/schedule.json` at runtime, like the apps.
- The dead Ruby backend came out of next-caltrain-pwa, and App Engine
  there serves static files only.
- Issue #36 there turned out to be our own transcription slip in
  `data/holiday_north.csv` (College Park on train 139 instead of 141), not a
  Caltrain error. That's a good example of why this project builds its feed
  from GTFS alone, so the two feeds can be diffed.

Then the decision to build this as a separate project, rather than recreate
the current Caltrain app, and these choices from Woodie:

- Repo `next-caltrain-react`, App Engine project `next-caltrain-app`.
- Start on free Datastore through the SQLAlchemy dialect; `datastore-native`
  and `postgres` branches come later. Bail out of the dialect if it fights
  us; the data model is simple.
- **Transaction-based, not scheduled:** a request after the cache expires
  does the work and waits for it. Serving a stale feed with a "refresh in a
  minute" flag was considered and rejected (reasons in `docs/DESIGN.md`).
- Holidays from GTFS only, with CSV export endpoints so the GTFS can be
  shown to Caltrain staff as human-readable tables.
- If keeping the hand-crafted feed format needed absurd workarounds, the
  apps could learn a new format. It turned out not to: Pydantic describes
  the existing format as is.

Cloud setup, all done by Woodie on 2026-10-21:

```bash
gcloud services enable firestore.googleapis.com --project=next-caltrain-app
gcloud firestore databases create --location=us-west2 --type=datastore-mode --project=next-caltrain-app
gcloud app create --region=us-west2 --project=next-caltrain-app
```

The region is `us-west2`, matching next-caltrain-pwa and outgoing-netpress,
and can't be changed. The database reports `freeTier: true` and
`appEngineIntegrationMode: DISABLED`, because it was created before the App
Engine app. That only matters for App Engine's legacy built-in Datastore
API, which we don't use; the `google-cloud-datastore` client and the
SQLAlchemy dialect are unaffected. App Engine serves at
`next-caltrain-app.appspot.com` (also `next-caltrain-app.wl.r.appspot.com`).

## Things checked so far

Verified before writing the design, so they don't need re-checking:

- **The python-datastore-sqlalchemy dialect** (v0.0.4, MIT, one
  maintainer, last pushed 2026-10-07) supports SELECT, INSERT, UPDATE and DELETE through the ORM.
  But `Connection.begin()`/`commit()`/`rollback()` in
  `sqlalchemy_datastore/datastore_dbapi.py` only log, there are no joins,
  and each inserted row is its own `put()`. The design's "write everything
  under a version, then switch one `Current` entity" pattern exists because
  of this.
- **Bundled Memcache** is set up with `wrap_wsgi_app`, and Google's docs only
  show WSGI frameworks. FastAPI is ASGI, so the plan is an `a2wsgi` bridge.
  Unproven: the first spike.
- **Memorystore** needs a Serverless VPC Access connector from App Engine
  standard (documented for Valkey and Redis; not confirmed for Memcached).
  Not free, so it waits for the `postgres` branch.
- **`SQLALCHEMY_ENGINE_OPTIONS`** is Flask-SQLAlchemy's setting. With FastAPI,
  the Cloud SQL Python Connector goes in as
  `create_engine("postgresql+pg8000://", creator=getconn)`.
- **Extra feed keys are safe for both apps:** next-caltrain-swift decodes
  with `Codable`, and next-caltrain-kotlin reads named keys from an
  `org.json` `JSONObject`.
- **GTFS size:** about 5,900 rows per feed version (5,469 stop times, 261
  trips, 107 stops), under Datastore's free 20,000 writes a day.

## Conventions here

- **Production is next-caltrain-pwa's feed.** The apps read
  `https://next-caltrain-pwa.appspot.com/feed/schedule.json`; this
  project's feed is for comparison until it's trusted. Nothing here should
  touch next-caltrain-pwa's deploy.
- **Branches and PRs** for implementation, straight to `main` for docs, as in
  the cross-project notes.
- **Python 3.13** to match App Engine's `python313` runtime. As of this
  writing, mise only has 3.12 installed, so `mise install python@3.13` comes
  first.
- **Tests** read like RSpec output: Vitest's tree reporter for the client, as
  in next-caltrain-pwa. For Python, picking a pytest setup that nests
  describe/context/it (and prints it) is an open choice.
- **Makefile targets** (`lint`, `test`, `check`) once there's code to run.
- **The Datastore emulator** (`cloud-datastore-emulator`, already installed
  in the gcloud SDK) for local runs and tests, not the real database.

## Current status

The repo has the README, LICENSE and `docs/DESIGN.md`, and no code yet.
The cloud project, App Engine app and Datastore database exist; nothing is
deployed.

## Next steps

1. Spike the two risks, on a branch: a minimal FastAPI app on App Engine
   that reads and writes bundled Memcache through `a2wsgi`, and does a
   SQLAlchemy round trip to Datastore through the dialect (emulator first,
   then the real database).
2. The data model and GTFS loader, with tests against the emulator.
3. The feed endpoint, with the expiry and lock behavior from
   `docs/DESIGN.md`, plus the CSV endpoints.
4. Diff the generated feed against next-caltrain-pwa's.
5. The KendoReact client, porting `CaltrainService.js` and its tests.
6. Add `docs/DEVELOPMENT.md` once there's a real dev loop.
