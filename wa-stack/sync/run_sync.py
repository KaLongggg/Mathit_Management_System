"""Hourly Thinkific -> Supabase sync runner (containerised).

Runs `thinkific_sync.run("all", commit=...)` on boot and every hour at :00.
NEVER purges (upsert only) so local-only fields are preserved. Safety default
is dry-run; set SYNC_DRY_RUN=false in .env to actually write.
"""
import logging
import os
import time

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from thinkific_sync import run as run_sync

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("thinkific_sync_runner")

# Safety: default to dry-run. Flip to false in .env once verified.
DRY_RUN = os.getenv("SYNC_DRY_RUN", "true").lower() == "true"
CRON = os.getenv("SYNC_CRON", "0 * * * *")  # hourly at :00
TZ = pytz.timezone(os.getenv("TZ", "Asia/Hong_Kong"))


def do_sync():
    commit = not DRY_RUN
    log.info("Thinkific sync starting (commit=%s, purge=never) …", commit)
    try:
        run_sync("all", commit=commit, purge=False)
        log.info("Thinkific sync finished OK.")
    except Exception as e:  # never let one bad run kill the service
        log.exception("Thinkific sync failed: %s", e)


if __name__ == "__main__":
    log.info("Thinkific sync service up (SYNC_DRY_RUN=%s, cron='%s').", DRY_RUN, CRON)
    do_sync()  # run once on boot

    sched = BackgroundScheduler(
        timezone=TZ,
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 600},
    )
    sched.add_job(do_sync, CronTrigger.from_crontab(CRON, timezone=TZ),
                  id="thinkific_hourly", replace_existing=True)
    sched.start()

    while True:
        time.sleep(3600)
