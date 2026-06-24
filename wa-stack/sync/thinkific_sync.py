"""Thinkific -> Supabase sync.

Tables are now Thinkific-owned (business-only columns were dropped), so the
sync is the source of truth: it overwrites mapped columns on conflict.

Order matters because of FKs: course -> student -> enrolments.
Enrolments referencing an unknown student/course are skipped (FK safety).

Usage:
  python thinkific_sync.py all   --dry-run            # preview everything
  python thinkific_sync.py all   --commit --purge     # truncate + full reload
  python thinkific_sync.py users --commit             # one entity, upsert only
"""
import argparse

import psycopg2.extras

from thinkific_client import get_all
from db import get_conn  # standalone psycopg2 connection (reads the same .env DB vars)


# ----------------------------- coercion helpers -----------------------------
def to_bool(v):
    if v is None:
        return None
    return str(v).strip().lower() in ("true", "1", "t", "yes")


def to_num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def date_only(v):
    """enrolled_at is a DATE column; strip any time portion."""
    return v[:10] if v else None


def text_list(v):
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x) for x in v) or None
    return str(v) if v else None


# ----------------------------- custom fields (users) ------------------------
CPF_DEF_MAP = {47809: "phone_number", 48189: "dse_year", 63517: "dse_aim", 47810: "current_level"}


def extract_custom_fields(user):
    out = {}
    for f in (user.get("custom_profile_fields") or []):
        val = f.get("value")
        if not val:
            continue
        col = CPF_DEF_MAP.get(f.get("custom_profile_field_definition_id"))
        if col:
            out[col] = str(val).replace(" ", "") if col == "phone_number" else val
    return out


# ----------------------------- mappers --------------------------------------
STUDENT_COLS = ["student_id", "first_name", "last_name", "full_name", "email",
                "created_at", "roles", "external_source",
                "phone_number", "dse_year", "dse_aim", "current_level"]

COURSE_COLS = ["course_id", "course_name", "slug", "product_id", "subtitle",
               "description", "keywords", "course_card_image_url", "instructor_id"]

ENROL_COLS = ["id", "student_id", "course_id", "course_name", "user_email", "user_name",
              "status", "enrolled_at", "percentage_completed", "completed", "completed_at",
              "expired", "expiry_date", "is_free_trial", "started_at", "activated_at", "updated_at"]


def map_user(u):
    row = {
        "student_id": str(u.get("id")),
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "full_name": u.get("full_name"),
        "email": (u.get("email") or "").strip().lower() or None,
        "created_at": u.get("created_at"),
        "roles": text_list(u.get("roles")),
        "external_source": u.get("external_source"),
    }
    row.update(extract_custom_fields(u))
    return row


def map_course(c):
    return {
        "course_id": str(c.get("id")),
        "course_name": c.get("name"),
        "slug": c.get("slug"),
        "product_id": str(c.get("product_id")) if c.get("product_id") else None,
        "subtitle": c.get("subtitle"),
        "description": c.get("description"),
        "keywords": c.get("keywords"),
        "course_card_image_url": c.get("course_card_image_url"),
        "instructor_id": str(c.get("instructor_id")) if c.get("instructor_id") else None,
    }


def derive_status(e):
    if to_bool(e.get("completed")):
        return "completed"
    if to_bool(e.get("expired")):
        return "expired"
    if e.get("activated_at"):
        return "active"
    return "pending"


def map_enrollment(e):
    return {
        "id": str(e.get("id")),
        "student_id": str(e.get("user_id")),
        "course_id": str(e.get("course_id")),
        "course_name": e.get("course_name"),
        "user_email": (e.get("user_email") or "").strip().lower() or None,
        "user_name": e.get("user_name"),
        "status": derive_status(e),
        "enrolled_at": date_only(e.get("activated_at") or e.get("created_at")),
        "percentage_completed": to_num(e.get("percentage_completed")),
        "completed": to_bool(e.get("completed")),
        "completed_at": e.get("completed_at"),
        "expired": to_bool(e.get("expired")),
        "expiry_date": e.get("expiry_date"),
        "is_free_trial": to_bool(e.get("is_free_trial")),
        "started_at": e.get("started_at"),
        "activated_at": e.get("activated_at"),
        "updated_at": e.get("updated_at"),
    }


# ----------------------------- DB helpers -----------------------------------
def upsert(cur, table, cols, conflict, rows):
    if not rows:
        return 0
    values = [tuple(r.get(c) for c in cols) for r in rows]
    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c != conflict)
    sql = f"""INSERT INTO {table} ({", ".join(cols)}) VALUES %s
              ON CONFLICT ({conflict}) DO UPDATE SET {set_clause}"""
    psycopg2.extras.execute_values(cur, sql, values, page_size=500)
    return len(rows)


def existing_ids(cur, table, col):
    cur.execute(f"SELECT {col} FROM {table};")
    return {str(r[0]) for r in cur.fetchall()}


# ----------------------------- sync entrypoints -----------------------------
def run(entity, commit=False, purge=False, limit=None, show=3):
    print(f"=== sync {entity} (commit={commit}, purge={purge}, limit={limit}) ===")
    conn = get_conn()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            if purge and commit:
                # FK-safe truncate order
                print("Purging enrolments, student, course …")
                cur.execute("TRUNCATE enrolments;")
                if entity in ("students", "users", "all"):
                    cur.execute("TRUNCATE student CASCADE;")
                if entity in ("courses", "all"):
                    cur.execute("TRUNCATE course CASCADE;")

            if entity in ("courses", "all"):
                _load(cur, "course", "/courses", map_course, COURSE_COLS, "course_id", commit, limit, show)
            if entity in ("students", "users", "all"):
                _load(cur, "student", "/users", map_user, STUDENT_COLS, "student_id", commit, limit, show,
                      require_email=True)
            if entity in ("enrolments", "all"):
                _load_enrolments(cur, commit, limit, show)

        if commit:
            conn.commit()
            print("\n✅ COMMITTED.")
        else:
            conn.rollback()
            print("\nDRY RUN — rolled back, nothing written.")
    finally:
        conn.close()


def _load(cur, table, path, mapper, cols, conflict, commit, limit, show, require_email=False):
    rows, samples, skipped = [], [], 0
    for i, item in enumerate(get_all(path)):
        if limit and i >= limit:
            break
        r = mapper(item)
        if require_email and not r.get("email"):
            skipped += 1
            continue
        rows.append(r)
        if len(samples) < show:
            samples.append(r)
    print(f"\n[{table}] fetched={len(rows)} skipped_no_email={skipped}")
    for s in samples:
        print("   ", s)
    if commit:
        n = upsert(cur, table, cols, conflict, rows)
        print(f"   upserted {n}")


def _load_enrolments(cur, commit, limit, show):
    # Need existing student/course ids to skip FK orphans
    valid_students = existing_ids(cur, "student", "student_id")
    valid_courses = existing_ids(cur, "course", "course_id")
    rows, samples, orphans = [], [], 0
    for i, item in enumerate(get_all("/enrollments")):
        if limit and i >= limit:
            break
        r = map_enrollment(item)
        if r["student_id"] not in valid_students or r["course_id"] not in valid_courses:
            orphans += 1
            continue
        rows.append(r)
        if len(samples) < show:
            samples.append(r)
    print(f"\n[enrolments] fetched={len(rows)} skipped_orphan_fk={orphans}")
    for s in samples:
        print("   ", s)
    if commit:
        n = upsert(cur, "enrolments", ENROL_COLS, "id", rows)
        print(f"   upserted {n}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("entity", choices=["users", "students", "courses", "enrolments", "all"])
    p.add_argument("--commit", action="store_true", help="write (default: dry run)")
    p.add_argument("--purge", action="store_true", help="TRUNCATE before load (needs --commit)")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--show", type=int, default=3)
    args = p.parse_args()
    run(args.entity, commit=args.commit, purge=args.purge, limit=args.limit, show=args.show)
