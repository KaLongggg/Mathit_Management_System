import os, time, hashlib, requests, psycopg2, json, re
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
import pytz, pystache
import random

# ---- Load env ----
load_dotenv()
USER = os.getenv("user")
PASSWORD = os.getenv("password")
HOST = os.getenv("host")
PORT = os.getenv("port")
DBNAME = os.getenv("dbname")
BOT_KEY = os.getenv("BOT_SHARED_SECRET", "")

WA_API_URL = os.getenv("WA_API_URL", "http://localhost:3000/send")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

HEADERS = {"X-API-KEY": BOT_KEY} if BOT_KEY else {}


# ---- DB connection ----
def get_conn():
    # optional one-liner to verify env values (remove later if noisy)
    print(
        "DB CONNECT:",
        {
            "user": USER,
            "host": HOST,
            "port": PORT,
            "dbname": DBNAME,
            "sslmode": "require",
        },
    )
    return psycopg2.connect(
        user=USER,
        password=PASSWORD,
        host=HOST,
        port=PORT,
        dbname=DBNAME,
        sslmode="require",
        connect_timeout=10,  # ✅ don't hang forever
    )


renderer = pystache.Renderer()
scheduler = BackgroundScheduler(timezone="Asia/Hong_Kong")
jobs_index = {}


def fetch_active_rules():
    sql = """
      SELECT id, name, cron_expr, COALESCE(timezone,'Asia/Hong_Kong') AS timezone,
             sql_query, message_template, image_path, pdf_path, active, run_at
      FROM whatsapp_schedules
      WHERE active = true;
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def normalize_phone(p):
    return re.sub(r"\s+", "", str(p))


def query_to_dicts(sql_text):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql_text)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def rule_signature(r: dict) -> str:
    h = hashlib.sha256()
    for k in (
        "cron_expr",
        "timezone",
        "sql_query",
        "message_template",
        "image_path",
        "pdf_path",
        "run_at",
    ):
        v = str(r.get(k) or "").encode("utf-8")
        h.update(v)
        h.update(b"|")
    return h.hexdigest()


def log_send(
    schedule_id, student_id, whatsapp_number, message, status, error=None, payload=None
):
    """Insert a log row into whatsapp_schedule_logs."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO whatsapp_schedule_logs
                  (schedule_id, student_id, whatsapp_number, message, status, error, payload)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    schedule_id,
                    student_id,
                    whatsapp_number,
                    message,
                    status,
                    error,
                    json.dumps(payload) if payload else None,
                ),
            )
    except Exception as e:
        print(f"⚠️ Failed to log send: {e}")


def run_rule(r: dict):
    print(f"⏱️ Running rule: {r['name']} ({r['id']})")
    rows = query_to_dicts(r["sql_query"])
    sent = skipped = 0

    for row in rows:
        raw_phone = row.get("phone_number") or row.get("whatsapp") or row.get("phone")
        if not raw_phone:
            skipped += 1
            continue

        phone = normalize_phone(raw_phone)
        if not phone:
            skipped += 1
            continue

        message = renderer.render(r.get("message_template") or "", row)

        # --- Build payload ---
        payload = {"phone": str(phone), "message": message}
        if r.get("image_path"):
            payload["image_path"] = f"assets/{r['image_path']}"
        if r.get("pdf_path"):
            payload["pdf_path"] = f"assets/{r['pdf_path']}"
        # ----------------------

        student_id = row.get("student_id") or ""  # text

        try:
            if DRY_RUN:
                print(f"[DRY] {payload}")
                status, err = "dry_run", None
            else:
                resp = requests.post(
                    WA_API_URL, json=payload, headers=HEADERS, timeout=20
                )
                resp.raise_for_status()
                print(f"✅ sent to {phone}")
                status, err = "sent", None

            sent += 1
            log_send(
                r["id"], student_id, phone, message, status, error=err, payload=payload
            )

        except Exception as e:
            print(f"❌ send failed to {phone}: {e}")
            log_send(
                r["id"],
                student_id,
                phone,
                message,
                "failed",
                error=str(e),
                payload=payload,
            )

        # pacing delay: random between 2 and 5 seconds
        delay = random.uniform(2, 5)  # e.g. 2.37s, 4.81s
        print(f"⏳ delaying {delay:.2f} seconds before next send...")
        time.sleep(delay)

    print(f"🎯 Done. Sent={sent}, Skipped(no phone)={skipped}, TotalRows={len(rows)}")

    # One-time schedules disable themselves after running so they don't re-fire.
    if r.get("run_at"):
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("UPDATE whatsapp_schedules SET active = false WHERE id = %s", (r["id"],))
            print(f"✅ One-time rule '{r['name']}' completed; disabled.")
        except Exception as e:
            print(f"⚠️ Failed to disable one-time rule {r['id']}: {e}")


def resync():
    rules = fetch_active_rules()
    seen = set()
    for r in rules:
        seen.add(r["id"])
        sig = rule_signature(r)
        job_id = f"rule-{r['id']}"
        existing = jobs_index.get(r["id"])
        if existing and existing["sig"] == sig:
            continue  # unchanged

        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

        tz = pytz.timezone(r["timezone"] or "Asia/Hong_Kong")
        if r.get("run_at"):
            # One-time: fire once at the stored instant (timestamptz is tz-aware).
            scheduler.add_job(
                run_rule, DateTrigger(run_date=r["run_at"]),
                args=[r], id=job_id, replace_existing=True, misfire_grace_time=3600,
            )
            print(f"📌 Scheduled (one-time) {r['name']} @ {r['run_at']}")
        else:
            trigger = CronTrigger.from_crontab(r["cron_expr"], timezone=tz)
            scheduler.add_job(run_rule, trigger, args=[r], id=job_id, replace_existing=True)
            print(f"📌 Scheduled {r['name']} @ {r['cron_expr']} ({r['timezone']})")
        jobs_index[r["id"]] = {"sig": sig}

    for rid in list(jobs_index.keys()):
        if rid not in seen:
            try:
                scheduler.remove_job(f"rule-{rid}")
            except Exception:
                pass
            jobs_index.pop(rid, None)
            print(f"🗑️ Unscheduled rule {rid}")


if __name__ == "__main__":
    print(
        "🔄 Starting scheduler process… DRY_RUN =", DRY_RUN
    )  # ✅ first log immediately
    resync()
    scheduler.add_job(
        resync, "interval", seconds=60, id="resync", replace_existing=True
    )
    scheduler.start()

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        scheduler.shutdown()
