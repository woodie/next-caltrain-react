"""The schedule feed: fetched on demand, then cached until the next morning.

For now the feed comes from next-caltrain-pwa; building it from Caltrain's
GTFS replaces fetch_upstream() later (see docs/DESIGN.md).
"""

import json
import os
import threading
import urllib.request
from collections.abc import Callable
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")

# The last train out of San Francisco leaves just after midnight, so a
# snapshot is good until 3:00 AM Pacific.
REFRESH_AT = time(3, 0)

UPSTREAM_URL = os.environ.get(
    "UPSTREAM_FEED_URL", "https://next-caltrain-pwa.appspot.com/feed/schedule.json"
)


def next_refresh(now: datetime) -> datetime:
    """The first 3:00 AM Pacific after `now`."""
    local = now.astimezone(PACIFIC)
    today = datetime.combine(local.date(), REFRESH_AT, tzinfo=PACIFIC)
    if local < today:
        return today
    return datetime.combine(local.date() + timedelta(days=1), REFRESH_AT, tzinfo=PACIFIC)


def fetch_upstream() -> dict[str, Any]:
    with urllib.request.urlopen(UPSTREAM_URL, timeout=30) as response:
        return json.load(response)


class FeedCache:
    """One snapshot per instance. A request after it expires waits while a new
    one is fetched; there's no "stale, please refresh" response."""

    def __init__(
        self,
        fetch: Callable[[], dict[str, Any]] = fetch_upstream,
        clock: Callable[[], datetime] = lambda: datetime.now(PACIFIC),
    ):
        self._fetch = fetch
        self._clock = clock
        self._lock = threading.Lock()
        self._snapshot: dict[str, Any] | None = None

    def get(self) -> dict[str, Any]:
        # The lock makes a second request wait for the first one's fetch
        # instead of starting its own.
        with self._lock:
            now = self._clock()
            if self._snapshot is None or now >= self._snapshot["expiresAt"]:
                self._snapshot = {
                    **self._fetch(),
                    "generatedAt": now,
                    "expiresAt": next_refresh(now),
                }
            return self._snapshot
