# Picking up next-caltrain-react in a new Cowork session

Cross-project conventions (git, branches and PRs, pushing, test structure,
comments, prose) are in `~/workspace/woodie/docs/COWORK.md`. The design is
in `docs/DESIGN.md`; this file covers what a new session needs to know that
the design doesn't.

## What this is

The Next Caltrain web app, https://next-caltrain-app.appspot.com/: React +
TypeScript with no component library, doing what the iOS and Android apps do, plus a
calendar planner. It also builds and serves its own schedule feed,
`/feed/schedule.json`, from Caltrain's GTFS, with no server: GitHub Actions
build the feed, and App Engine serves everything as static files.

It's the fifth port of Next Caltrain: J2ME, the KaiOS PWA
(next-caltrain-pwa), Swift (next-caltrain-swift), Kotlin
(next-caltrain-kotlin), and this one.

## The product

What sets it apart from other Caltrain apps, in Woodie's words: it doesn't
show you a timetable and make you figure out what to do. It works out which
schedule applies now (weekday, weekend, holiday) and **always has a train
selected**, which is what makes the countdown to the next train possible.
The selection and the "stepping, not scrolling" trip list are D-pad
heritage from the feature-phone versions.

**next-caltrain-swift is the baseline** (agreed 2026-10-21): port from
Swift, and check Kotlin agrees. The PWA's `CaltrainService.js`, which its
own docs still call the reference, has fallen behind.

## Where things stand (2026-10-21)

- **Live:** the app (home, trip list, trip detail, stations, about, and the
  "Create Calendar Event" planner) and the static GTFS feed. Checked on
  Woodie's iPhone in Chrome, light and dark.
- **The feed is not production yet.** The iOS and Android apps still read
  `https://next-caltrain-pwa.appspot.com/feed/schedule.json` (hand-maintained
  holidays). Woodie is meeting Caltrain staff first; don't point the apps
  at this feed until he says so.
- **The two feeds differ only where GTFS disagrees with Caltrain's PDF:**
  stations, weekday, weekend and `scheduleDate` are identical; the holiday
  tables (Tamien stops on Local trains, Diridon times, College Park on #143
  vs #141) and special dates (GTFS's MLK Day 2027-01-27 instead of 01-18,
  and nothing after the timetable ends 2027-01-31) differ. These are the
  discrepancies in next-caltrain-pwa's `docs/HOLIDAY.md`, the agenda for
  that meeting. To recompare, download both with `curl --compressed` (App
  Engine sometimes sends gzip unasked) and compare each key with
  `jq -S`.
- **The Update schedule workflow** ran by hand once (no new timetable, as
  expected). Its pull-request path hasn't run on GitHub yet; a forced run
  would exercise it (close that PR unmerged).

## The schedule feed

See "Schedule updates" in `docs/DESIGN.md`. In short:

- `public/feed/gtfs-<version>.json`: each timetable, named for its GTFS
  build. `public/feed/go-live.json`: each one's go-live date.
  `public/feed/schedule.json`: the live one, the file the apps read.
- **Update schedule** (Mondays and on demand) opens a PR for a new
  timetable, **proposing tomorrow** as the go-live date. Woodie's design: a
  person edits that one line in `go-live.json` to the real date before
  merging. (An earlier version asked in a separate issue; dropped.) Line
  edits beat renaming files, especially from the GitHub app. Caltrain's
  next timetable is expected around January 2027; GTFS's
  `feed_start_date` and caltrain.com/schedules/pdfs "Effective" date are
  shown in the PR as suggestions.
- **Switch schedule** (daily, 3:30 AM PDT / 2:30 AM PST) copies the
  timetable whose go-live date has arrived to `schedule.json` and deploys.
- **The TypeScript builder is an exact port:** on the same GTFS it matches
  next-caltrain-pwa's Python output (stations, weekday, weekend) and that
  pipeline's GTFS holiday parse (`data/_holiday_*.csv`), train for train.
  Special dates come from `calendar_dates.txt`.

## Cloud

One App Engine project, `next-caltrain-app` (region `us-west2`, can't
change), serving the `default` service only: static files. No database,
no other service, nothing running between deploys.

- **Deploying:** GitHub Actions only (see "Conventions" below), through
  Woodie's shared Workload Identity pool in project `outgoing-netpress`
  (netpress's project, named "netpress site and keys") and the deploy-only
  account `github-deploy@next-caltrain-app.iam.gserviceaccount.com`, which
  trusts this repo. The same pool deploys netpress, johnwoodell and
  liamwoodell; see the cross-project notes.
- **APIs left on** after the 2026-10-21 cleanup, all needed: App Engine
  (+ reporting), Cloud Build, Artifact Registry, Storage (×3), Pub/Sub
  (Cloud Build depends on it), IAM, IAM Credentials, Logging, Monitoring,
  Trace, Telemetry, Service Usage, Service Management.

## History, briefly

- **2026-10-20/21: job prep.** Woodie had a job lead whose stack was
  FastAPI, SQLAlchemy, React with Kendo UI and TypeScript. He knows older
  Python/Flask (Google, internal), React/TS and relational databases (20+
  years) well; the new parts were FastAPI, SQLAlchemy 2.0 and KendoReact.
- **The backend was tried and retired.** A FastAPI feed service, briefly
  its own repo and project (next-caltrain-feed, both since deleted), was
  first planned on Datastore through `python-datastore-sqlalchemy`
  (dropped: its transactions only log), then on a $10/month Cloud SQL
  Postgres (never used). Woodie's call: SQLAlchemy wasn't going to teach
  anything worth $10 a month, and the timetable changes about once a
  year, so the feed became static files built by GitHub Actions. The
  Cloud SQL instance and Datastore database are deleted, the `feed`
  service is deleted, and `dispatch.yaml` is empty.
- **KendoReact was removed too** (2026-10-21, tag `kendo-react` marks the
  last version with it): its 1.5 MB theme, paid components and
  desktop-style widgets lost out to the browser's native controls, which
  give iPhone its own pickers. See "Native controls" in `docs/DESIGN.md`.

## Conventions here

- **Merging to `main` is deploying.** GitHub Actions deploys every push to
  `main`, so `main` is always what's live; don't deploy by hand (Woodie:
  "having the push and deploy separate could lead to confusion"). A
  docs-only commit redeploys too, which is harmless.
- **Ask before pushing:** "Can I push this?" before any push, PR, issue or
  remote change, then do it after a yes.
- **Branches and PRs** for implementation, straight to `main` for docs. Woodie
  merges and deletes the remote branch; then sync local `main` and delete
  the local branch (squash or merge commit: check the content matches
  before `git branch -D`).
- **One `package.json`,** with the house scripts (`dev`, `build`, `lint`,
  `test`, `check`, `server`, `deploy`) plus `schedule:update` and
  `schedule:switch`. `npm run check` before pushing.
- **Spec text matches the apps.** next-caltrain-swift and
  next-caltrain-kotlin keep their five spec files (`CaltrainScheduleSpec`,
  `CaltrainServiceSpec`, `GoodTimesSpec`, `ScheduleSpec`,
  `TripViewModelSpec`) identical in describe/context/it text except for
  real implementation differences (method-name `describe`s like
  `.direction(from:to:stops:)` vs `.direction()`, constants like `.weekday`
  vs `WEEKDAY`). Ports here must keep the same text, in the same order;
  extract with `grep -oE '(describe|context|it)\("[^"]*"'` and diff. The
  calendar planner's spec keeps next-caltrain-pwa's text the same way.
- **Look on the phone:** Woodie judges UI from his iPhone, so check at
  phone width, in light and dark.

## Gotchas

- **iOS Safari won't open a picker from code:** `showPicker()` does
  nothing for a time input there, and focusing a hidden input doesn't open
  the wheel. The tap has to land on the input itself, so the date and time
  are visible native inputs shaped as pills.
- **Vitest stays on 4.x** for penultimate's `vitest >=4.1.0 <5` peer. Vitest
  5 made npm 11.16 crash ("Cannot read properties of null (reading
  'children')") and corrupt the lockfile; `legacy-peer-deps` only hid it
  and dropped peer dependencies.
- **Workflow tokens don't start other workflows:** the switch deploys
  itself, and the update's PRs don't run the CI check. The repo setting
  "Allow GitHub Actions to create and approve pull requests" is on (set
  with `gh api`; the first attempt with `-F ...=true` silently did
  nothing, `--input` with a JSON body worked).
- **Scheduled workflows stop after 60 days** without repo activity
  (commits, issues, PRs; scheduled runs don't count). The Actions tab says
  so; run them by hand if needed.
- **App Engine may send gzip unasked,** including to curl without
  `--compressed`. Browsers and the apps handle it; raw tools don't.
- **Disabling Google Cloud APIs:** `cloudapis` (an umbrella) must go first,
  `firestore` before `firebaserules`, and Pub/Sub can't go where Cloud
  Build is used. `gcloud services disable` reports "has dependent
  services" across several lines: judge success by its exit code. Never
  use `--force`, which also disables dependents.

## Next steps

1. **Port the five spec files** from the apps (see "Conventions"), plus a
   script that diffs their describe/context/it text against
   next-caltrain-swift and next-caltrain-kotlin. The core logic in
   `src/lib` has no specs yet.
2. **After Woodie's Caltrain meeting:** decide whether the apps switch to
   this feed (their URL is in each app's config), and what to do about
   GTFS's holiday errors.
3. **Optional:** a forced Update schedule run to exercise the PR path;
   `npm run compare` for the two-feed comparison; a feed inspector page
   (perhaps a Kendo Grid, see `docs/DESIGN.md`).
4. **Postponed by Woodie:** the Features / Using the app / Development
   block drafted into the Swift and Kotlin READMEs, still uncommitted in
   both repos.
