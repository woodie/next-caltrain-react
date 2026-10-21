# Next Caltrain React

A cloud version of the Next Caltrain schedule pipeline, plus a web clone of
the iOS and Android apps.

- **Backend:** FastAPI on App Engine (standard, Python), with SQLAlchemy over
  Google Cloud Datastore. It turns Caltrain's GTFS feed into the same
  `schedule.json` the apps read, on demand, and caches it until the next
  morning.
- **Web client:** React + TypeScript with KendoReact, mirroring the
  Swift/Kotlin apps and their tests. It only depends on the feed, so the
  backend underneath can be swapped.

The feed is served from https://next-caltrain-app.appspot.com/feed/schedule.json,
next to the existing https://next-caltrain-pwa.appspot.com/feed/schedule.json,
so the two can be diffed.

See [docs/DESIGN.md](docs/DESIGN.md) for how it works and why.

## Sibling projects

- **Current feed and PWA:** [next-caltrain-pwa](https://github.com/woodie/next-caltrain-pwa),
  built from GTFS plus hand-maintained holiday CSVs
- **iOS app:** [next-caltrain-swift](https://github.com/woodie/next-caltrain-swift)
- **Android app:** [next-caltrain-kotlin](https://github.com/woodie/next-caltrain-kotlin)
