"""Next Caltrain's API: the schedule feed the apps and the web client read."""

import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from feed import FeedCache

# The same format the iOS and Android apps read (field names match the JSON),
# plus when this snapshot was built and when the server will next refresh it.
TimeTable = dict[str, list[int | None]]


class Schedule(BaseModel):
    specialDates: dict[str, int] = {}
    northStops: list[str]
    southStops: list[str]
    northWeekday: TimeTable
    northWeekend: TimeTable
    northHoliday: TimeTable
    southWeekday: TimeTable
    southWeekend: TimeTable
    southHoliday: TimeTable
    scheduleDate: int | None = None
    generatedAt: datetime
    expiresAt: datetime


app = FastAPI(title="Next Caltrain")
feed = FeedCache()


@app.get("/feed/schedule.json")
def schedule(response: Response) -> Schedule:
    # Not cached at the edge: every request reaches this app, which caches it.
    response.headers["Cache-Control"] = "no-store"
    return Schedule.model_validate(feed.get())


# On App Engine, app.yaml's static handlers serve the web client. Locally
# (make server), FastAPI serves the same built files, so the site works the
# same way.
web_dist = Path(__file__).parent / "web" / "dist"
if "GAE_ENV" not in os.environ and web_dist.is_dir():
    app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
