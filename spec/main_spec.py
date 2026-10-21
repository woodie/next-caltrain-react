from datetime import datetime

from expects import contain, equal, expect
from fastapi.testclient import TestClient
from mamba import before, context, description, it

import main
from feed import PACIFIC, FeedCache

STOPS = ["San Francisco", "Palo Alto"]
UPSTREAM = {
    "specialDates": {"2026-11-27": 2},
    "northStops": list(reversed(STOPS)),
    "southStops": STOPS,
    "northWeekday": {"101": [400, 430]},
    "northWeekend": {},
    "northHoliday": {},
    "southWeekday": {"102": [500, None]},
    "southWeekend": {},
    "southHoliday": {},
    "scheduleDate": 1781130300000,
}

with description("GET feed schedule.json") as self:
    with before.each:
        now = datetime(2026, 10, 21, 9, 0, tzinfo=PACIFIC)
        main.feed = FeedCache(fetch=lambda: UPSTREAM, clock=lambda: now)
        self.response = TestClient(main.app).get("/feed/schedule.json")
        self.body = self.response.json()

    with it("succeeds"):
        expect(self.response.status_code).to(equal(200))

    with it("is never cached at the edge"):
        expect(self.response.headers["cache-control"]).to(equal("no-store"))

    with it("keeps the apps' format, nulls included"):
        expect(self.body["southWeekday"]).to(equal({"102": [500, None]}))
        expect(self.body["specialDates"]).to(equal({"2026-11-27": 2}))

    with it("adds when the snapshot expires"):
        expect(self.body["expiresAt"]).to(contain("2026-10-22T03:00:00"))

    with context("when the upstream feed is missing a table"):
        with before.each:
            broken = {k: v for k, v in UPSTREAM.items() if k != "southHoliday"}
            main.feed = FeedCache(fetch=lambda: broken)
            self.client = TestClient(main.app, raise_server_exceptions=False)
            self.response = self.client.get("/feed/schedule.json")

        with it("fails instead of serving a broken feed"):
            expect(self.response.status_code).to(equal(500))
