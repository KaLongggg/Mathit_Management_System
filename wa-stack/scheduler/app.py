import os, time, hashlib, json, re, random, signal, sys, logging
import requests, psycopg2
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
import pytz, pystache

from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------- Logging ----------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("wa_scheduler")

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

# Map of bot_id -> base URL (e.g. {"whatsapp_bot":"http://bot:3000", ...}).
# A schedule's bot_id selects which WhatsApp account sends it; unknown/null
# falls back to WA_API_URL (single-bot back-compat).
try:
    BOT_ENDPOINTS = json.loads(os.getenv("BOT_ENDPOINTS", "") or "{}")
except (ValueError, TypeError):
    BOT_ENDPOINTS = {}

# Timeouts (tune)
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
DB_STATEMENT_TIMEOUT_MS = int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "20000"))  # 20s
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "20"))

HEADERS = {"X-API-KEY": BOT_KEY} if BOT_KEY else {}


def send_url_for(bot_id):
    """Resolve the /send URL for a schedule's bot_id (falls back to WA_API_URL)."""
    base = BOT_ENDPOINTS.get(bot_id) if bot_id else None
    return f"{base.rstrip('/')}/send" if base else WA_API_URL


# ---------------- Requests session with retry ----------------
def build_http_session():
    s = requests.Session()
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.8,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"],
        raise_on_status=False,
    )
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s

HTTP = build_http_session()

# ---- DB connection ----
def get_conn():
    # connect_timeout prevents hanging connects
    conn = psycopg2.connect(
        user=USER,
        password=PASSWORD,
        host=HOST,
        port=PORT,
        dbname=DBNAME,
        sslmode="require",
        connect_timeout=DB_CONNECT_TIMEOUT,
    )
    return conn

renderer = pystache.Renderer()

# Job defaults prevent overlapping + missed-run storms
scheduler = BackgroundScheduler(
    timezone="Asia/Hong_Kong",
    job_defaults={
        "coalesce": True,
        "max_instances": 1,
        "misfire_grace_time": 300,  # seconds
    },
)

jobs_index = {}
STOP_REQUESTED = False


def fetch_active_rules():
    sql = """
      SELECT id, name, cron_expr, COALESCE(timezone,'Asia/Hong_Kong') AS timezone,
             sql_query, message_template, image_path, pdf_path, active, run_at, bot_id
      FROM whatsapp_schedules
      WHERE active = true;
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SET statement_timeout = %s;", (DB_STATEMENT_TIMEOUT_MS,))
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def normalize_phone(p):
    return re.sub(r"\s+", "", str(p))

def normalize_student_id(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None

def query_to_dicts(sql_text):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SET statement_timeout = %s;", (DB_STATEMENT_TIMEOUT_MS,))
        cur.execute(sql_text)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def rule_signature(r: dict) -> str:
    h = hashlib.sha256()
    for k in ("cron_expr", "timezone", "sql_query", "message_template", "image_path", "pdf_path", "run_at", "bot_id"):
        v = str(r.get(k) or "").encode("utf-8")
        h.update(v); h.update(b"|")
    return h.hexdigest()


def log_send(schedule_id, student_id, whatsapp_number, message, status, error=None, payload=None):
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SET statement_timeout = %s;", (DB_STATEMENT_TIMEOUT_MS,))

            if student_id is None:
                cur.execute(
                    """
                    INSERT INTO whatsapp_schedule_logs
                      (schedule_id, whatsapp_number, message, status, error, payload)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        schedule_id,
                        whatsapp_number,
                        message,
                        status,
                        error,
                        json.dumps(payload) if payload else None,
                    ),
                )
            else:
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
        log.warning("Failed to log send: %s", e)


def purge_old_failed_logs(days: int = 14):
    """Keep the log table tidy — drop stale 'failed' rows. 'sent' rows are kept
    forever (they drive the de-dup exclusion in campaign queries)."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SET statement_timeout = %s;", (DB_STATEMENT_TIMEOUT_MS,))
            cur.execute(
                "DELETE FROM whatsapp_schedule_logs "
                "WHERE status = 'failed' AND sent_at < now() - (%s || ' days')::interval",
                (days,),
            )
            if cur.rowcount:
                log.info("Purged %s old failed log rows (> %s days).", cur.rowcount, days)
    except Exception as e:
        log.warning("purge_old_failed_logs failed: %s", e)


def run_rule(r: dict):
    global STOP_REQUESTED
    if STOP_REQUESTED:
        return

    rule_id = r["id"]
    target_url = send_url_for(r.get("bot_id"))
    log.info("Running rule: %s (%s) via %s", r.get("name"), rule_id, target_url)

    try:
        rows = query_to_dicts(r["sql_query"])
    except Exception as e:
        log.error("DB query failed for rule %s: %s", rule_id, e)
        return

    sent = skipped = 0

    for row in rows:
        if STOP_REQUESTED:
            log.info("Stop requested, exiting rule %s early.", rule_id)
            break

        raw_phone = row.get("phone_number") or row.get("whatsapp") or row.get("phone")
        if not raw_phone:
            skipped += 1
            continue

        phone = normalize_phone(raw_phone)
        if not phone:
            skipped += 1
            continue

        message = renderer.render(r.get("message_template") or "", row)

        payload = {"phone": str(phone), "message": message}
        if r.get("image_path"):
            payload["image_path"] = f"assets/{r['image_path']}"
        if r.get("pdf_path"):
            payload["pdf_path"] = f"assets/{r['pdf_path']}"

        student_id = normalize_student_id(row.get("student_id"))

        try:
            if DRY_RUN:
                log.info("[DRY] phone=%s payload=%s", phone, payload)
                status, err = "dry_run", None
            else:
                resp = HTTP.post(target_url, json=payload, headers=HEADERS, timeout=HTTP_TIMEOUT)

                # If WhatsApp isn't linked, abort the whole run instead of
                # hammering every recipient (avoids thousands of failed logs).
                if resp.status_code == 503 and "whatsapp_not_ready" in (resp.text or ""):
                    log.warning("WhatsApp not ready — aborting rule %s (sent %s, %s remaining skipped).",
                                rule_id, sent, len(rows) - sent - skipped)
                    break

                # Treat non-2xx as failure (but retries already handled transiently)
                if resp.status_code < 200 or resp.status_code >= 300:
                    raise RuntimeError(f"WA API {resp.status_code}: {resp.text[:200]}")

                status, err = "sent", None
                log.info("Sent to %s", phone)

            sent += 1
            log_send(rule_id, student_id, phone, message, status, error=err, payload=payload)

        except Exception as e:
            log.error("Send failed to %s: %s", phone, e)
            log_send(rule_id, student_id, phone, message, "failed", error=str(e), payload=payload)

        delay = random.uniform(2, 5)
        time.sleep(delay)

    log.info("Done rule %s. Sent=%s Skipped=%s TotalRows=%s", rule_id, sent, skipped, len(rows))

    # One-time schedules disable themselves after running so they don't re-fire.
    if r.get("run_at"):
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("SET statement_timeout = %s;", (DB_STATEMENT_TIMEOUT_MS,))
                cur.execute("UPDATE whatsapp_schedules SET active = false WHERE id = %s", (rule_id,))
            log.info("One-time rule %s completed; disabled.", rule_id)
        except Exception as e:
            log.warning("Failed to disable one-time rule %s: %s", rule_id, e)


def resync():
    global STOP_REQUESTED
    if STOP_REQUESTED:
        return

    try:
        rules = fetch_active_rules()
    except Exception as e:
        log.error("resync() failed to fetch rules: %s", e)
        return

    seen = set()

    for r in rules:
        rid = r["id"]
        seen.add(rid)

        sig = rule_signature(r)
        job_id = f"rule-{rid}"

        existing = jobs_index.get(rid)
        if existing and existing["sig"] == sig:
            continue

        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

        tz = pytz.timezone(r.get("timezone") or "Asia/Hong_Kong")
        if r.get("run_at"):
            # One-time: fire once at the stored instant (timestamptz is tz-aware).
            scheduler.add_job(
                run_rule,
                DateTrigger(run_date=r["run_at"]),
                args=[r],
                id=job_id,
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                misfire_grace_time=3600,
            )
            log.info("Scheduled (one-time) %s @ %s", r.get("name"), r.get("run_at"))
        else:
            trigger = CronTrigger.from_crontab(r["cron_expr"], timezone=tz)
            scheduler.add_job(
                run_rule,
                trigger,
                args=[r],
                id=job_id,
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                misfire_grace_time=300,
            )
            log.info("Scheduled %s @ %s (%s)", r.get("name"), r.get("cron_expr"), r.get("timezone"))
        jobs_index[rid] = {"sig": sig}

    # remove jobs no longer active
    for rid in list(jobs_index.keys()):
        if rid not in seen:
            try:
                scheduler.remove_job(f"rule-{rid}")
            except Exception:
                pass
            jobs_index.pop(rid, None)
            log.info("Unscheduled rule %s", rid)


def handle_signal(signum, frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True
    log.info("Received signal %s. Shutting down scheduler...", signum)
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    resync()
    purge_old_failed_logs()  # tidy on boot
    scheduler.add_job(resync, "interval", seconds=60, id="resync", replace_existing=True)
    scheduler.add_job(purge_old_failed_logs, "interval", hours=24, id="purge_logs", replace_existing=True)
    scheduler.start()
    log.info("Scheduler running (DRY_RUN=%s).", DRY_RUN)

    while True:
        time.sleep(3600)