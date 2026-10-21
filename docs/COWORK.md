# Picking up next-caltrain-react in a new Cowork session

Cross-project conventions (git, branches and PRs, Makefile targets, test
structure, comments, prose) are in `~/workspace/woodie/docs/COWORK.md`.

## What this is

The Next Caltrain web app: React + TypeScript with KendoReact, doing what
the iOS and Android apps do, and a clean example of a React app reading a
feed. It's the `default` service of the App Engine project
`next-caltrain-app`; the schedule feed is that project's `feed` service,
from **next-caltrain-feed**. The full design is in `docs/DESIGN.md`.

**Split on 2026-10-21.** This repo started out holding the feed's backend
too (FastAPI, SQLAlchemy, Cloud SQL). With four apps reading the feed,
Woodie moved the feed to its own repo, next-caltrain-feed, and chose one
App Engine project with two services over a second project. The sections
below written before the split ("Why this stack", "How this got here",
"Things checked so far") still describe the backend research and the
Cloud SQL setup; that history belongs to next-caltrain-feed now, and moves
there when it next needs editing.

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

## The product, and which port is the baseline

This is the fifth port of Next Caltrain: J2ME, then the KaiOS PWA, then
Swift, Kotlin and now React. What sets it apart from other Caltrain apps,
in Woodie's words: it doesn't show you a timetable and make you figure out
what to do. It works out which schedule applies now (weekday, weekend,
holiday) and **always has a train selected**. The selection started as a
requirement of the D-pad phones, but it's what makes the countdown to the
next train possible, which other apps don't have. The "stepping, not
scrolling" trip list is the same D-pad heritage.

**next-caltrain-swift is the baseline** (agreed 2026-10-21). The PWA's
`CaltrainService.js`, which its own docs still call the reference, has
fallen behind: no `TripViewModel`, no tomorrow trips, no saved stations.
Port from Swift, and check Kotlin agrees.

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
- At first: free Datastore through the SQLAlchemy dialect. After the
  dialect turned out to fake its transactions, Woodie switched to **the
  cheapest Cloud SQL Postgres** (2026-10-21) and dropped the dialect. He
  doesn't want to pay for a database he doesn't need, so Postgres is
  **temporary, for a few months**: always plan to bail out to Datastore
  (native `google-cloud-datastore`, not the dialect) later. Keep the data
  model and queries easy to move: the version-then-switch pattern, no
  reliance on joins.
- **The 3:00 AM Pacific expiry** is fine because the last train out of San
  Francisco always leaves just after midnight.
- **Mamba** for Python tests (Woodie's pick).
- **Clone all the apps' touch behavior,** including the fixed-cell
  "stepping, not scrolling" trip list (see "Web client" in
  `docs/DESIGN.md`).
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

Cloud SQL setup, done 2026-10-21 (Woodie approved the instance as
specified, about $9–11 a month):

```bash
gcloud services enable sqladmin.googleapis.com --project=next-caltrain-app
gcloud sql instances create next-caltrain-db --project=next-caltrain-app --database-version=POSTGRES_17 --edition=ENTERPRISE --tier=db-f1-micro --region=us-west2 --availability-type=zonal --storage-type=HDD --storage-size=10 --no-storage-auto-increase --no-backup --database-flags=cloudsql.iam_authentication=on
gcloud sql databases create caltrain --instance=next-caltrain-db --project=next-caltrain-app
gcloud sql users create next-caltrain-app@appspot --instance=next-caltrain-db --project=next-caltrain-app --type=cloud_iam_service_account --database-roles=cloudsqlsuperuser
gcloud sql users create mando.woodie@gmail.com --instance=next-caltrain-db --project=next-caltrain-app --type=cloud_iam_user --database-roles=cloudsqlsuperuser
gcloud projects add-iam-policy-binding next-caltrain-app --member=serviceAccount:next-caltrain-app@appspot.gserviceaccount.com --role=roles/cloudsql.client
gcloud projects add-iam-policy-binding next-caltrain-app --member=serviceAccount:next-caltrain-app@appspot.gserviceaccount.com --role=roles/cloudsql.instanceUser
```

- The connection name is `next-caltrain-app:us-west2:next-caltrain-db`
  (zone `us-west2-c`). It has a public IP with no authorized networks, so
  the only way in is the Cloud SQL Python Connector (or Auth Proxy) with
  IAM.
- **No passwords anywhere.** The built-in `postgres` user has no password
  set; IAM users get their database roles from `--database-roles` instead.
- **The service account's database username drops the
  `.gserviceaccount.com` suffix:** `next-caltrain-app@appspot`, not the full
  email and not `@appspot.iam` (both rejected). Woodie's account,
  `mando.woodie@gmail.com`, is the active gcloud account on his Mac.
- `cloudsqlsuperuser` is broader than the app needs. Fine for a temporary
  learning database; narrow it if this ever matters.

## Things checked so far

Verified before writing the design, so they don't need re-checking:

- **The python-datastore-sqlalchemy dialect** (v0.0.4, MIT, one
  maintainer, last pushed 2026-10-07) supports SELECT, INSERT, UPDATE and
  DELETE through the ORM. But `Connection.begin()`/`commit()`/`rollback()`
  in `sqlalchemy_datastore/datastore_dbapi.py` only log, there are no
  joins, and each inserted row is its own `put()`. That's why it was
  dropped.
- **Mamba 0.11.3** (last release 2023-11-09, classifiers stop at Python 3.9)
  runs fine on Python 3.13.16 with `expects`: nested documentation output,
  `before.each`, readable failures, no deprecation warnings on import.
  Tested in a throwaway venv.
- **Bundled Memcache** is set up with `wrap_wsgi_app`, and Google's docs only
  show WSGI frameworks. FastAPI is ASGI, so the plan is an `a2wsgi` bridge.
  Unproven: the first spike.
- **Memorystore** needs a Serverless VPC Access connector from App Engine
  standard (documented for Valkey and Redis; not confirmed for Memcached).
  Not free, and not worth it for one small JSON document.
- **Cloud SQL's cheapest option** is `db-f1-micro`, about $8–10 a month
  plus storage; shared-core sizes only exist in the Enterprise edition,
  with no SLA. A free-tier `e2-micro` VM running Postgres would cost $0,
  but only in `us-west1`, `us-central1` or `us-east1`, and skips Cloud SQL.
- **Touch behavior** in the apps: the gesture table in `docs/DESIGN.md`
  comes from the `onTapGesture`/`DragGesture` handlers in next-caltrain-swift
  (`HomeView.swift`, `TripListView.swift`, `StationSelectionView.swift`,
  `StationPickerView.swift`); next-caltrain-kotlin mirrors them with
  `detectTapGestures`/`detectDragGestures`.
- **`SQLALCHEMY_ENGINE_OPTIONS`** is Flask-SQLAlchemy's setting. With FastAPI,
  the Cloud SQL Python Connector goes in as
  `create_engine("postgresql+pg8000://", creator=getconn)`.
- **Extra feed keys are safe for both apps:** next-caltrain-swift decodes
  with `Codable`, and next-caltrain-kotlin reads named keys from an
  `org.json` `JSONObject`.
- **GTFS size:** about 5,900 rows per feed version (5,469 stop times, 261
  trips, 107 stops). For the later Datastore move, that's under Datastore's
  free 20,000 writes a day.

## Conventions here

- **Production is next-caltrain-pwa's feed.** The iOS and Android apps read
  `https://next-caltrain-pwa.appspot.com/feed/schedule.json`. Nothing here
  should touch next-caltrain-pwa's deploy.
- **Merging to `main` is deploying.** GitHub Actions deploys every push to
  `main`, so `main` is always what's live; don't deploy by hand (Woodie:
  "having the push and deploy separate could lead to confusion"). Signing
  in uses Workload Identity Federation with no stored key: the shared pool
  `github` in project `next-caltrain-feed` (trusts only repos owned by
  `woodie`) and `github-deploy@next-caltrain-app.iam.gserviceaccount.com`
  (trusts only next-caltrain-react and next-caltrain-feed).
- **Only Woodie pushes:** ask "Can I push this?" before any push, PR or
  issue.
- **Branches and PRs** for implementation, straight to `main` for docs, as in
  the cross-project notes. Since merging deploys, a docs-only commit to
  `main` redeploys too, which is harmless.
- **One `package.json` at the root,** with the house scripts (`dev`,
  `build`, `lint`, `test`, `check`, `server`, `deploy`). No Makefile: there's
  only one language here now.
- **Spec text matches the apps.** Woodie put real effort into making
  next-caltrain-swift's and next-caltrain-kotlin's test output identical
  unless a difference reflects a real implementation difference (checked
  2026-10-21: all five spec pairs have the same tree; only method-name
  `describe`s like `.direction(from:to:stops:)` versus `.direction()`, and
  constant names like `.weekday` versus `WEEKDAY`, differ). The web
  client's ports of those five specs must keep the same describe/context/it
  text, in the same order. Bonus points for the same output format too.
  When porting, extract the names from both apps (`grep -oE
  '(describe|context|it)\("[^"]*"'`) and diff against the TypeScript
  version.

## Gotchas

- **Vitest stays on 4.x** while specs use `justBeforeEach` from
  penultimate, which declares `vitest >=4.1.0 <5` as a peer. The Vite
  scaffold pulled in Vitest 5, and npm 11.16 reported the conflict as an
  internal crash (`Cannot read properties of null (reading 'children')`,
  then `'edgesOut'`) that also corrupted the lockfile. `legacy-peer-deps`
  only hid it and dropped KendoReact's own peers
  (`kendo-smartpaste-common`, `kendo-popup-common`, ...). The fix was
  pinning `vitest ^4.1.12` and regenerating the lockfile.
- **KendoReact's flat Button** sets `background: none !important`; the
  round icon buttons use `fillMode="solid"` recolored in `styles.css`.

## Current status

Live at https://next-caltrain-app.appspot.com/ (2026-10-21), as the
`default` service, deployed by GitHub Actions on every push to `main`;
checked on Woodie's iPhone in Chrome. The repo was reworked into a plain
React app at the root (branch `feature/3-feed-client`; PR #3 was closed
by mistake without merging, so it was merged locally and pushed). The
README has screenshots in `pics/`, like the Swift and Kotlin READMEs.

## Next steps

1. Port the five spec files from the apps, plus the script that diffs their
   describe/context/it text against next-caltrain-swift and
   next-caltrain-kotlin.
2. Depend on next-caltrain-feed's JavaScript client package once it exists,
   instead of `src/lib/Schedule.ts`.
