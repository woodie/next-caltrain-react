# Design

## Goals

1. **Do what the iOS and Android apps do, in a browser,** down to their
   touch behavior and their specs.
2. **Be a clean example of a React app reading a feed.** The app knows the
   feed's format and nothing about where it comes from.
3. **No component library.** The job-prep stack (FastAPI, SQLAlchemy,
   KendoReact) was tried and retired: a schedule that changes once a year
   needs no server or database, and the browser's own controls are what
   iPhone users expect.
4. **No servers to run:** the schedule is built by GitHub Actions and served
   as a static file.

## Architecture

Static files only, on App Engine (project `next-caltrain-app`): the app,
and the schedule feed it reads, `/feed/schedule.json`. No server, no
database. The feed is built from Caltrain's GTFS by this repo's own
scripts and committed as a file (see "Schedule updates" below), because
Caltrain changes its timetable about once a year.

| Where | `/feed/schedule.json` comes from |
|---|---|
| App Engine | `public/feed/schedule.json`, cached for 10 minutes |
| `npm run dev`, `npm run server` | The same file; set `FEED_ORIGIN` to proxy `/feed` to another site instead (e.g. next-caltrain-pwa's feed, to compare) |
| A build with `VITE_SCHEDULE_URL` set | That URL, for pointing a build at another feed |

## Schedule updates

Two GitHub Actions workflows keep the feed current, with no laptop and no
cloud server involved. Every timetable is kept in `public/feed/`:

| File | What it is |
|---|---|
| `gtfs-<version>.json` | One timetable, named for the GTFS build it came from (`gtfs-20260610-2225.json` for `feed_version` "UTC: 10-Jun-2026 22:25"); never renamed |
| `go-live.json` | When each timetable goes live, one line each: `"gtfs-20260610-2225.json": "2026-01-31"` |
| `schedule.json` | A copy of the timetable live today: the file the apps read |

**Update schedule** (`.github/workflows/update-schedule.yml`) runs every
Monday, and whenever it's started by hand from the Actions tab or the GitHub
app:

1. Downloads Caltrain's GTFS and builds `schedule.json` from it in
   TypeScript (`scripts/schedule/build.ts`, ported from next-caltrain-pwa's
   `generate.py` and `update_json.py`; its weekday, weekend and holiday
   tables match that pipeline's GTFS parse exactly).
2. Checks it: errors (an empty table, a train with the wrong number of
   stops, an impossible time) stop the run; warnings (a train reaching a
   station before the one it left, i.e. bad GTFS data) are reported.
3. If `gtfs-<version>.json` already exists: no new timetable, nothing to do.
   That's the usual Monday.
4. Otherwise writes it, adds its line to `go-live.json` with a **proposed
   go-live date of tomorrow** (or the date it was started with), and opens a
   pull request. The description shows GTFS's start date
   (`feed_start_date`) and the "Effective" date from
   [Caltrain's schedules page](https://www.caltrain.com/schedules/pdfs)
   next to the proposed one, links straight to editing `go-live.json` on
   the pull request's branch, and lists what changed (trains added, removed
   and retimed; special dates) and any warnings.

**Before merging, a person sets the real go-live date** by editing that one
line. The date is always a person's decision; GTFS and Caltrain's page only
suggest it. (Caltrain's last change took effect January 31, 2026, and both
agreed; the next is expected around January 2027.) Merging only adds the
files.

**Switch schedule** (`.github/workflows/switch-schedule.yml`), daily at
3:30 AM PDT (2:30 AM PST), after the schedule day starts: copies the
timetable with the latest go-live date that has arrived to
`public/feed/schedule.json`, then commits and deploys. On most days nothing
changes. It can also be run by hand.

- **Holidays come from GTFS alone,** as do the special dates (from
  `calendar_dates.txt`: weekend service on a weekday is `1`, the modified
  schedule is `2`). Where GTFS disagrees with Caltrain's published PDF
  (see next-caltrain-pwa's `docs/HOLIDAY.md`), this feed shows GTFS's
  version, e.g. MLK Day 2027 as January 27 rather than 18.
- **Timetables are formatted one train per line,** so a pull request shows
  exactly which trains changed.
- **GitHub turns off scheduled workflows** in public repos after 60 days
  without activity (commits, issues, pull requests; scheduled runs don't
  count). An update's pull request counts, and Caltrain publishes a new
  timetable shortly before it takes effect, so the switch will be running
  when it matters. If it has been turned off, GitHub says so on the Actions
  tab, and it can be run by hand.
- **The switch deploys itself:** a push made with a workflow's own token
  doesn't start other workflows, so it can't rely on the CI deploy.
- **Pull requests the update opens don't run the CI check,** for the same
  reason. The update runs the same checks itself before opening one.

## Loading the feed

The same rules as the apps' `Schedule` and `ContentView` (`src/App.tsx`,
`src/lib/Schedule.ts`):

1. **A cached schedule from today's schedule day** (which starts at 2:00 AM)
   is used as is, without a network request.
2. **A cached schedule from an earlier day:** fetch a new one, waiting up to
   10 seconds, and fall back to the cached copy on a timeout or error.
3. **No cache:** fetch, showing "Loading schedule data" on the About screen,
   or "Unable to load schedule" if that fails.

A fetched schedule is validated before it's cached or used: non-empty stop
lists, and every train's times as long as its direction's stop list. The
cache is `localStorage`.

## Screens and touch

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
| Header buttons | Tap | Swap direction; reset a manual selection; plan a trip for the calendar |

**Stepping, not scrolling.** The trip list doesn't scroll. It draws as many
fixed rows as fit and, as you drag, moves the selection by one row for every
row-height of movement (kept within the day's trips), then redraws the rows'
contents. The home circle does the same with its one visible trip. This is
the apps' `DragGesture` behavior (`HomeView.swift`, `TripListView.swift`),
which goes back to the D-pad phones the app started on
(`src/useStepDrag.ts`).

**Drag versus tap:** after a drag ends, taps are ignored for 0.2 seconds, so
letting go of a drag doesn't also open a train.

**Back:** each screen is pushed onto the browser's history, so the phone's
back gesture and the browser's back button work like the apps' navigation
stacks.

## Adding a trip to the calendar

The calendar button, always directly below the swap button (on the trip
list it also mirrors the back button), opens a planner
modeled on Google Maps: **Leave at** or **Arrive by**, a time and a date.
It shows the planned train with the trains before and after it (the
planned one boxed, like the trip list's selection) and refreshes as the
inputs change. **Add to Google Calendar** opens a prefilled event: the
planned train's exact times on Pacific time, titled "Caltrain to
{destination}", with the three trains in the description and the planned
one in bold. It's a plain link, so no sign-in or API is involved.

- **The date picks the schedule:** weekday, weekend, or holiday from the
  feed's `specialDates`.
- **It opens on the selected train,** on the next date whose schedule
  matches the one on screen (so viewing Weekend on a Tuesday plans a
  Saturday).
- **Times before 2:00 AM count as that night,** the end of the schedule
  day, so 12:05 AM finds the 12:05 AM train.

The logic (`src/lib/CalendarTrip.ts`) is ported from next-caltrain-pwa's
`CalendarTrip.js` (its issue #39), and its spec keeps the PWA's
describe/context/it text.

## The logic: ported from Swift

next-caltrain-swift is the baseline. `src/lib` is a straight TypeScript port
of its `GoodTimes`, `CaltrainSchedule` (with `Schedule`), `CaltrainService`
and `TripViewModel`, keeping their names and structure so the specs carry
over line for line. `TripViewModel` is a plain class, as in the apps;
`useTripViewModel` wraps it for React and ticks it every second.

## Native controls

- **No component library.** Buttons, the date and time inputs, the Leave
  at `<select>` and the station-defaults `<dialog>` are the browser's own,
  so iPhone shows its own pickers and sheets, like the Swift app. Desktop
  browsers draw them their own way; nobody is expected to use the app on
  a desktop.
- **Icons** are six inline SVGs in `src/screens/icons.tsx`.
- **KendoReact was tried and removed** (tag `kendo-react`, 2026-10-21): its
  theme was about 1.5 MB of CSS against the app's 7 KB, several useful
  components (TimePicker, DropDownButton) are paid, and its widgets
  replaced the ones iPhone provides. A Kendo Grid "feed inspector" (full
  timetables, the GTFS vs PDF diff) would still be a fair use of it, as a
  separate page.
- **The trip list isn't a grid:** it steps instead of scrolling, so it's a
  custom row layout.

## Tests

**The same specs, with the same output, as the Swift and Kotlin apps.**
The next-caltrain-swift and next-caltrain-kotlin repos keep their five spec
files (`CaltrainScheduleSpec`, `CaltrainServiceSpec`, `GoodTimesSpec`,
`ScheduleSpec`, `TripViewModelSpec`) line for line identical in their
describe/context/it text. The only differences are real implementation
differences, written in each language's own terms: method names (Swift's
`.direction(from:to:stops:)` versus Kotlin's `.direction()`) and constants
(Swift's `.weekday` versus Kotlin's `WEEKDAY`). This app's specs follow the
same rule: the same five files, the same tree, and TypeScript's own names
only where the TypeScript code genuinely differs. A script that extracts the
describe/context/it text from all three repos and diffs it keeps them
honest.

They run on Vitest with its tree reporter and `justBeforeEach` from
[penultimate](https://github.com/woodie/penultimate), as in
next-caltrain-pwa. The Swift and Kotlin specs use `justBeforeEach` (Quick
and kwick) the same way.

## Deploying

**Merging to `main` is deploying.** There's no separate deploy step to
remember or forget: `main` is always what's live.

- **Every pull request** runs `npm run check` (`.github/workflows/ci.yml`).
- **Every push to `main`** runs `npm run deploy` from GitHub Actions: check,
  build, and deploy the `default` service.

Don't run `npm run deploy` by hand; it exists so the workflow and the docs
agree on one command. The workflow signs in to Google Cloud with Workload
Identity Federation: GitHub's identity token for the run is exchanged for
short-lived credentials of a deploy-only service account, so no long-lived
key is stored anywhere. The workflow names both; they aren't secrets,
since the account only trusts named repos.

## Development

```bash
npm run dev     # hot reload on http://localhost:5173/
npm run check   # type-check, lint and specs, before pushing
npm run server  # the production build on http://localhost:8080/
```

Both serve the feed from `public/feed/`. To compare with another feed, set
`FEED_ORIGIN`, e.g. `FEED_ORIGIN=https://next-caltrain-pwa.appspot.com npm
run dev`.

```bash
npm run schedule:update                          # with a new timetable: write it, go-live tomorrow
npm run schedule:update -- --go-live 2027-01-30   # ... or with this go-live date
npm run schedule:switch                           # what the daily switch runs
```
