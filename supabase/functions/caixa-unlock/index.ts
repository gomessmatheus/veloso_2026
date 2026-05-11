/**
 * supabase/functions/caixa-unlock/index.ts
 *
 * Step-up authentication for the Caixa (financial control) view.
 *
 * Request:  POST { password: string }
 *           Authorization: Bearer <supabase_user_jwt>
 *
 * Response 200: { token: string, expires_at: string }
 *   - token is a signed JWT (15 min); store in sessionStorage.
 *   - Also sets cookie  caixa_session=<token>; HttpOnly; Secure; SameSite=Strict
 *
 * Response 401: credential not found (no password set) or wrong password
 * Response 429: too many failed attempts — locked for 30 min
 * Response 422: missing / invalid body
 */

import { serve }             from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient }      from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt            from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ── Environment ───────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CAIXA_JWT_SECRET  = Deno.env.get("CAIXA_JWT_SECRET")!; // 256-bit random, set in Supabase secrets
const ALLOWED_ORIGIN    = Deno.env.get("SITE_URL") || "https://veloso-2026.vercel.app";

// ── Config ────────────────────────────────────────────────
const SESSION_TTL_SEC   = 15 * 60;  // 15 minutes
const MAX_FAILURES      = 5;
const LOCKOUT_WINDOW_MIN= 15;
const LOCKOUT_DURATION_MIN = 30;

// ── CORS headers ──────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

// ── Helpers ───────────────────────────────────────────────
function jsonResponse(body: unknown, status: number, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
  });
}

async function buildJwtKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

// ── Main handler ──────────────────────────────────────────
serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── 1. Authenticate the caller ────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  const userJwt = authHeader.slice(7);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Verify the Supabase user JWT
  const { data: { user }, error: authErr } = await supabase.auth.getUser(userJwt);
  if (authErr || !user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }
  const userId = user.id;
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // ── 2. Parse request body ─────────────────────────────
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 422);
  }
  const password = body?.password;
  if (typeof password !== "string" || password.length < 1) {
    return jsonResponse({ error: "password required" }, 422);
  }

  // ── 3. Rate limiting ──────────────────────────────────
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
  const { data: recentFailures } = await supabase
    .from("caixa_unlock_attempts")
    .select("id", { count: "exact", head: false })
    .eq("user_id", userId)
    .eq("success", false)
    .gte("created_at", windowStart);

  const failCount = (recentFailures as unknown[])?.length ?? 0;

  if (failCount >= MAX_FAILURES) {
    // Log locked-out attempt
    await supabase.from("caixa_audit").insert({
      user_id: userId,
      event:   "unlock_locked",
      meta:    { ip: clientIp, failures: failCount },
    });
    return jsonResponse({
      error:       "Too many failed attempts. Try again in 30 minutes.",
      retry_after: LOCKOUT_DURATION_MIN * 60,
    }, 429);
  }

  // ── 4. Load credential hash ───────────────────────────
  const { data: cred, error: credErr } = await supabase
    .from("caixa_credentials")
    .select("password_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (credErr || !cred) {
    // No password set yet — user must call caixa-set-password first
    return jsonResponse({ error: "No caixa password set. Contact admin.", code: "NO_CREDENTIAL" }, 401);
  }

  // ── 5. Verify password ────────────────────────────────
  const valid = await bcrypt.compare(password, cred.password_hash);

  // Record attempt
  await supabase.from("caixa_unlock_attempts").insert({
    user_id: userId,
    ip:      clientIp,
    success: valid,
  });

  if (!valid) {
    // Audit failure
    await supabase.from("caixa_audit").insert({
      user_id: userId,
      event:   "unlock_failure",
      meta:    { ip: clientIp, failures_in_window: failCount + 1 },
    });
    return jsonResponse({ error: "Incorrect password" }, 401);
  }

  // ── 6. Issue step-up JWT ──────────────────────────────
  const jti        = crypto.randomUUID();
  const now        = Math.floor(Date.now() / 1000);
  const exp        = now + SESSION_TTL_SEC;
  const expiresAt  = new Date(exp * 1000).toISOString();

  const key = await buildJwtKey(CAIXA_JWT_SECRET);
  const token = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub:              userId,
      jti,
      iat:              now,
      exp:              getNumericDate(SESSION_TTL_SEC),
      caixa_unlocked:   true,
    },
    key
  );

  // ── 7. Store session in DB (for server-side revocation) ──
  await supabase.from("caixa_sessions").insert({
    user_id:    userId,
    jti,
    expires_at: expiresAt,
  });

  // ── 8. Audit success + reset rate-limit ──────────────
  await supabase.from("caixa_audit").insert({
    user_id: userId,
    event:   "unlock_success",
    meta:    { ip: clientIp, jti },
  });

  // Delete recent failures after successful unlock (reset window)
  await supabase
    .from("caixa_unlock_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("success", false)
    .gte("created_at", windowStart);

  // ── 9. Set HttpOnly cookie + return token ─────────────
  const cookieValue = [
    `caixa_session=${token}`,
    `Max-Age=${SESSION_TTL_SEC}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");

  return jsonResponse(
    { token, expires_at: expiresAt, jti },
    200,
    { "Set-Cookie": cookieValue }
  );
});
