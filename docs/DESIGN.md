# Design

## Goals

1. **Do what the iOS and Android apps do, in a browser,** down to their
   touch behavior and their specs.
2. **Be a clean example of a React app reading a feed.** The app knows the
   feed's format and nothing about where it comes from.
3. **Learn KendoReact** (the feed side of the job-prep stack, FastAPI and
   SQLAlchemy, lives in next-caltrain-feed).

## Architecture

The app is the `default` service of the App Engine project
`next-caltrain-app`, as static files. The feed is that project's `feed`
service, from next-caltrain-feed, whose `dispatch.yaml` routes `/feed/*` to
it. So the app fetches `/feed/schedule.json` from its own origin, with no
CORS, and each repo deploys only its own service.

| Where | `/feed/schedule.json` comes from |
|---|---|
| App Engine | The `feed` service, through `dispatch.yaml` |
| `npm run dev`, `npm run server` | Vite's proxy, to `FEED_ORIGIN` (default `https://next-caltrain-app.appspot.com`) |
| A build with `VITE_SCHEDULE_URL` set | That URL, for pointing a build at another feed |

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

The calendar button on the home screen and the trip list opens a planner
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

## KendoReact

- **Components:** `Button` with KendoReact's SVG icons for the round toolbar
  buttons, `Dialog` for saving default stations, and, on the calendar
  screen, `DropDownList` (Leave at / Arrive by), `DateInput` (the time),
  `DatePicker` and a primary `Button`.
- **Free tier only, so no license key:** every component above is free.
  Some aren't, and Kendo checks per component: without a key, a paid one
  puts a "License key missing" banner and an "Invalid license" watermark
  over the whole app. `TimePicker` is paid ("TimePicker: all", says the
  console), which is why the time is a `DateInput` with spinners.
  `DropDownList` is free unless it's filterable or virtualized. Check
  Telerik's [free vs. premium list](https://www.telerik.com/kendo-react-ui/components/getting-started/free-vs-premium)
  before adding a component, and look for the console warning after.
- **Theme:** `default-main-dark`, under the apps' own colors
  (`src/styles.css`, from `AppStyle.swift`).
- **The trip list isn't a Grid.** KendoReact's Grid scrolls its rows, and
  the trip list must step instead, so it's a custom row layout.
- **Styling Kendo to someone else's design:** the flat Button style sets
  `background: none !important`, so the round buttons use the solid style,
  recolored.

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
since the account only trusts this repo and next-caltrain-feed.

## Development

```bash
npm run dev     # hot reload on http://localhost:5173/
npm run check   # type-check, lint and specs, before pushing
npm run server  # the production build on http://localhost:8080/
```

Both local servers proxy `/feed` to `FEED_ORIGIN`; set
`FEED_ORIGIN=http://localhost:8080` to use a local next-caltrain-feed
(`make server` there) with `npm run dev`.
