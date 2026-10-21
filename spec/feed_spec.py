from datetime import datetime

from expects import be, equal, expect
from mamba import before, context, description, it

from feed import PACIFIC, FeedCache, next_refresh


def pacific(*args):
    return datetime(*args, tzinfo=PACIFIC)


with description("next_refresh") as self:
    with context("before 3 AM"):
        with before.each:
            self.refresh = next_refresh(pacific(2026, 10, 21, 1, 30))

        with it("is 3 AM the same morning"):
            expect(self.refresh).to(equal(pacific(2026, 10, 21, 3, 0)))

    with context("after 3 AM"):
        with before.each:
            self.refresh = next_refresh(pacific(2026, 10, 21, 9, 15))

        with it("is 3 AM the next morning"):
            expect(self.refresh).to(equal(pacific(2026, 10, 22, 3, 0)))

    with context("at exactly 3 AM"):
        with before.each:
            self.refresh = next_refresh(pacific(2026, 10, 21, 3, 0))

        with it("is 3 AM the next morning"):
            expect(self.refresh).to(equal(pacific(2026, 10, 22, 3, 0)))

    with context("the night before daylight saving time ends"):
        with before.each:
            self.refresh = next_refresh(pacific(2026, 10, 31, 22, 0))

        with it("is 3 AM standard time"):
            expect(self.refresh.utcoffset().total_seconds()).to(equal(-8 * 3600))


with description("FeedCache") as self:
    with before.each:
        self.fetches = 0
        self.now = pacific(2026, 10, 21, 9, 0)

        def fetch():
            self.fetches += 1
            return {"scheduleDate": self.fetches}

        self.cache = FeedCache(fetch=fetch, clock=lambda: self.now)
        self.first = self.cache.get()

    with context("on the first request"):
        with it("fetches the feed"):
            expect(self.fetches).to(equal(1))

        with it("records when the snapshot was built"):
            expect(self.first["generatedAt"]).to(equal(self.now))

        with it("expires the snapshot at 3 AM the next morning"):
            expect(self.first["expiresAt"]).to(equal(pacific(2026, 10, 22, 3, 0)))

    with context("on a later request the same day"):
        with before.each:
            self.now = pacific(2026, 10, 21, 23, 59)
            self.second = self.cache.get()

        with it("serves the cached snapshot without fetching"):
            expect(self.fetches).to(equal(1))
            expect(self.second).to(be(self.first))

    with context("on a request a week later"):
        with before.each:
            self.now = pacific(2026, 10, 28, 12, 0)
            self.second = self.cache.get()

        with it("fetches a new snapshot"):
            expect(self.fetches).to(equal(2))
            expect(self.second["scheduleDate"]).to(equal(2))

        with it("expires it at 3 AM the next morning"):
            expect(self.second["expiresAt"]).to(equal(pacific(2026, 10, 29, 3, 0)))
