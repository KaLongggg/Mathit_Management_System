// Thinkific admin actions, called from the browser by signed-in staff.
// Auth is verified manually (verify_jwt=false) so CORS preflight works.
// Secrets: THINKIFIC_API_KEY (you set this). SUPABASE_* are auto-injected.
//
// Deploy:  supabase functions deploy thinkific-admin --no-verify-jwt
//          (or via the Supabase MCP deploy_edge_function with verify_jwt=false)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const THINKIFIC_API_KEY = Deno.env.get("THINKIFIC_API_KEY") ?? "";
const THINKIFIC_BASE = Deno.env.get("THINKIFIC_BASE_URL") ?? "https://api.thinkific.com/api/public/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Store-specific custom profile field definition ids.
const CPF = { phone_number: 47809, dse_year: 48189, dse_aim: 63517, current_level: 47810 };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: unknown) => (s ?? "").toString().trim();
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const deriveStatus = (e: any) =>
  e.completed ? "completed" : e.expired ? "expired" : e.activated_at ? "active" : "pending";

async function thinkific(path: string, method: string, body?: unknown) {
  const res = await fetch(`${THINKIFIC_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${THINKIFIC_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!THINKIFIC_API_KEY) return json({ error: "THINKIFIC_API_KEY secret is not set on the function." }, 500);

  // Verify the caller is a signed-in Supabase user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  try {
    if (payload?.action === "create_student") {
      const first = norm(payload.first_name), last = norm(payload.last_name);
      const email = norm(payload.email).toLowerCase();
      if (!first || !last || !email) return json({ error: "First name, last name and email are required." }, 400);

      const custom: any[] = [];
      const add = (id: number, v: string) => v && custom.push({ custom_profile_field_definition_id: id, value: v });
      add(CPF.phone_number, norm(payload.phone_number));
      add(CPF.dse_year, norm(payload.dse_year));
      add(CPF.current_level, norm(payload.current_level));

      const body: any = { first_name: first, last_name: last, email, send_welcome_email: true, skip_custom_fields_validation: true };
      if (custom.length) body.custom_profile_fields = custom;

      const r = await thinkific("/users", "POST", body);
      if (!r.ok) return json({ error: "Thinkific could not create the user.", status: r.status, detail: r.data }, 400);

      const u = r.data;
      const row = {
        student_id: String(u.id),
        first_name: u.first_name ?? first,
        last_name: u.last_name ?? last,
        full_name: u.full_name ?? `${first} ${last}`.trim(),
        email: (u.email ?? email).toLowerCase(),
        created_at: u.created_at ?? new Date().toISOString(),
        roles: Array.isArray(u.roles) ? u.roles.join(", ") : (u.roles ?? null),
        phone_number: norm(payload.phone_number) || null,
        dse_year: norm(payload.dse_year) || null,
        current_level: norm(payload.current_level) || null,
      };
      const { error } = await db.from("student").upsert(row, { onConflict: "student_id" });
      if (error) return json({ error: "Created in Thinkific but the local save failed: " + error.message, student: row }, 207);
      return json({ student: row });
    }

    if (payload?.action === "enrol") {
      const studentId = norm(payload.student_id), courseId = norm(payload.course_id);
      if (!studentId || !courseId) return json({ error: "student_id and course_id are required." }, 400);

      const r = await thinkific("/enrollments", "POST", {
        course_id: Number(courseId), user_id: Number(studentId), activated_at: new Date().toISOString(),
      });
      if (!r.ok) return json({ error: "Thinkific could not create the enrolment.", status: r.status, detail: r.data }, 400);

      const e = r.data;
      const row = {
        id: String(e.id),
        student_id: String(e.user_id ?? studentId),
        course_id: String(e.course_id ?? courseId),
        course_name: e.course_name ?? null,
        user_email: (e.user_email ?? "").toLowerCase() || null,
        user_name: e.user_name ?? null,
        status: deriveStatus(e),
        enrolled_at: dateOnly(e.activated_at ?? e.created_at ?? new Date().toISOString()),
        percentage_completed: e.percentage_completed ?? 0,
        completed: !!e.completed,
        completed_at: e.completed_at ?? null,
        expired: !!e.expired,
        expiry_date: e.expiry_date ?? null,
        is_free_trial: !!e.is_free_trial,
        started_at: e.started_at ?? null,
        activated_at: e.activated_at ?? null,
        updated_at: e.updated_at ?? null,
      };
      const { error } = await db.from("enrolments").upsert(row, { onConflict: "id" });
      if (error) return json({ error: "Enrolled in Thinkific but the local save failed: " + error.message, enrolment: row }, 207);
      return json({ enrolment: row });
    }

    if (payload?.action === "update_student") {
      const studentId = norm(payload.student_id);
      if (!studentId) return json({ error: "student_id is required." }, 400);

      const body: any = { skip_custom_fields_validation: true };
      if (payload.first_name !== undefined) body.first_name = norm(payload.first_name);
      if (payload.last_name !== undefined) body.last_name = norm(payload.last_name);
      if (payload.email !== undefined && norm(payload.email)) body.email = norm(payload.email).toLowerCase();

      const custom: any[] = [];
      const setIf = (key: string, id: number) => {
        if (payload[key] !== undefined) custom.push({ custom_profile_field_definition_id: id, value: norm(payload[key]) });
      };
      setIf("phone_number", CPF.phone_number);
      setIf("dse_year", CPF.dse_year);
      setIf("dse_aim", CPF.dse_aim);
      setIf("current_level", CPF.current_level);
      if (custom.length) body.custom_profile_fields = custom;

      const r = await thinkific(`/users/${studentId}`, "PUT", body);
      if (!r.ok) return json({ error: "Thinkific could not update the user.", status: r.status, detail: r.data }, 400);

      // PUT /users/{id} can return an empty body on success, so fall back to
      // the submitted values rather than assuming a response object.
      const u = r.data || {};
      const fn = norm(payload.first_name), ln = norm(payload.last_name);
      const row: any = {
        first_name: u.first_name ?? fn,
        last_name: u.last_name ?? ln,
        full_name: u.full_name ?? `${fn} ${ln}`.trim(),
        email: (u.email ?? norm(payload.email)).toLowerCase() || null,
        phone_number: norm(payload.phone_number) || null,
        dse_year: norm(payload.dse_year) || null,
        dse_aim: norm(payload.dse_aim) || null,
        current_level: norm(payload.current_level) || null,
      };
      const { data: saved, error } = await db.from("student").update(row).eq("student_id", studentId).select().single();
      if (error) return json({ error: "Updated in Thinkific but the local save failed: " + error.message }, 207);
      return json({ student: saved });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
