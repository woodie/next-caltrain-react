# Next Caltrain React

Live countdown to your next Caltrain, in the browser.

https://next-caltrain-app.appspot.com/

A React + TypeScript web app, built with KendoReact, that does what the
Next Caltrain iOS and Android apps do. It works out which schedule runs
today (weekday, weekend or holiday), always has a train selected, and
counts down to it. Drag on the countdown circle or the train list to step
to earlier or later trains.

## How it gets its data

The whole timetable comes from one JSON feed,
[next-caltrain-feed](https://github.com/woodie/next-caltrain-feed), at
`/feed/schedule.json` on the same site. The app downloads it at most once a
day (the schedule day starts at 2:00 AM), keeps it in `localStorage`, and
falls back to that copy when offline. Everything else, from finding the
next train to transfers at San Jose Diridon, happens in the browser.

See [docs/DESIGN.md](docs/DESIGN.md) for the details.

## Development

Needs Node.

```bash
npm install
npm run dev     # hot reload on http://localhost:5173/
npm run check   # type-check, lint and specs, before pushing
npm run server  # the production build on http://localhost:8080/
```

Merging to `main` deploys: a GitHub Actions workflow checks, builds and
publishes it to App Engine.

Locally, `/feed` is proxied to the deployed feed; set `FEED_ORIGIN` to use
another one (e.g. `FEED_ORIGIN=http://localhost:8080`).

## Sibling projects

- **iOS app:** [next-caltrain-swift](https://github.com/woodie/next-caltrain-swift)
- **Android app:** [next-caltrain-kotlin](https://github.com/woodie/next-caltrain-kotlin)
- **Schedule feed:** [next-caltrain-feed](https://github.com/woodie/next-caltrain-feed)
