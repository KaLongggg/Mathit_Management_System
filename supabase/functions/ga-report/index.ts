// Google Analytics (GA4) reporting for the dashboard.
// Server-side so the service-account key stays secret. Called by signed-in staff.
//
// Secrets to set on this function:
//   GA_PROPERTY_ID      — your GA4 property id (digits only, e.g. 123456789)
//   GA_SERVICE_ACCOUNT  — the full service-account JSON key (paste as-is)
//
// Deploy: via MCP deploy_edge_function with verify_jwt=false (auth is manual).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GA_PROPERTY_ID = (Deno.env.get("GA_PROPERTY_ID") ?? "").trim();
const GA_SERVICE_ACCOUNT = Deno.env.get("GA_SERVICE_ACCOUNT") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function getAccessToken(sa: any) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const input = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })}`;
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const jwt = `${input}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Google token error: " + JSON.stringify(data));
  return data.access_token as string;
}

async function runReport(token: string, body: unknown) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("GA API error: " + JSON.stringify(data));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Verify the caller is a signed-in Supabase user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Not configured yet → tell the dashboard to show a placeholder (not an error).
  if (!GA_PROPERTY_ID || !GA_SERVICE_ACCOUNT) return json({ configured: false });

  try {
    const sa = JSON.parse(GA_SERVICE_ACCOUNT);
    const token = await getAccessToken(sa);

    const [traffic, pages] = await Promise.all([
      runReport(token, {
        dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(token, {
        dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
    ]);

    const trafficRows = (traffic.rows ?? []).map((r: any) => ({
      date: r.dimensionValues[0].value, // YYYYMMDD
      sessions: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value),
    }));
    const topPages = (pages.rows ?? []).map((r: any) => ({
      path: r.dimensionValues[0].value,
      views: Number(r.metricValues[0].value),
    }));

    const totals = trafficRows.reduce(
      (a: any, r: any) => ({ sessions: a.sessions + r.sessions, users: a.users + r.users }),
      { sessions: 0, users: 0 },
    );

    return json({ configured: true, traffic: trafficRows, topPages, totals });
  } catch (err) {
    return json({ configured: true, error: String((err as Error)?.message ?? err) }, 200);
  }
});
