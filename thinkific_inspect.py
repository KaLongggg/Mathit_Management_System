"""One-off inspection: real custom_profile_fields labels + student table columns."""
import json
import psycopg2
from thinkific_client import _get
from Whatsapp_Scheduler import get_conn  # reuse DB connection

# 1) Look at custom_profile_fields across the first ~15 users
print("=== custom_profile_fields labels (first 15 users) ===")
body = _get("/users", {"page": 1, "limit": 15})
label_counts = {}
for u in body.get("items", []):
    for f in (u.get("custom_profile_fields") or []):
        lbl = f.get("label")
        label_counts[lbl] = label_counts.get(lbl, 0) + 1
print("Distinct labels seen:", json.dumps(label_counts, ensure_ascii=False, indent=2))

print("\n=== sample custom_profile_fields (first user that has values) ===")
for u in body.get("items", []):
    cpf = u.get("custom_profile_fields") or []
    if any(f.get("value") for f in cpf):
        print(json.dumps(cpf, ensure_ascii=False, indent=2))
        break

# 2) Actual columns of the local `student` table
print("\n=== student table columns (Supabase) ===")
try:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'student'
            ORDER BY ordinal_position;
        """)
        for name, dtype in cur.fetchall():
            print(f"  {name:20} {dtype}")
except Exception as e:
    print("  DB query failed:", e)
