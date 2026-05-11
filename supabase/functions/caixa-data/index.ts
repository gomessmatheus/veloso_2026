/**
 * supabase/functions/caixa-data/index.ts
 *
 * Secure proxy for all Caixa database operations.
 * Verifies the step-up session token before touching data.
 *
 * This is the ONLY way to read/write caixa_tx and caixa settings —
 * direct client queries are blocked by RLS (require is_caixa_unlocked()).
 *
 * Request:
 *   POST {
 *     action: "list_tx" | "save_tx" | "get_settings" | "set_settings"
 *             | "revoke_session" | "check_session",
 *     payload: { ... action-specific data ... }
 *   }
 *   Headers:
 *     Authorization: Bearer <supabase_user_jwt>
 *     X-Caixa-Token: <step_up_jwt>     ← issued by caixa-unlock
 *
 * Response 200: { data: ... }
 * Response 401: session expired or invalid
 * Response 403: wrong user
 */

import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify }       from "https://deno.land/x/djwt@v2.8/mod.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CAIXA_JWT_SECRET = Deno.env.get("CAIXA_JWT_SECRET")!;
const ALLOWED_ORIGIN   = Deno.env.get("SITE_URL") || "https://veloso-2026.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin":      ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":     "authorization, content-type, x-caixa-token",
  "Access-Control-Allow-Methods":     "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function buildJwtKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

// ── Verify step-up token ──────────────────────────────────
async function verifyStepUpToken(
  token: string,
  expectedUserId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ valid: boolean; jti?: string; reason?: string }> {
  try {
    const key     = await buildJwtKey(CAIXA_JWT_SECRET);
    const payload = await verify(token, key) as {
      sub?: string; jti?: string; caixa_unlocked?: boolean; exp?: number;
    };

    if (!payload.caixa_unlocked) return { valid: false, reason: "not_unlocked" };
    if (payload.sub !== expectedUserId) return { valid: false, reason: "user_mismatch" };

    const jti = payload.jti;
    if (!jti) return { valid: false, reason: "missing_jti" };

    // Check DB: session must exist, not revoked, not expired
    const { data: session } = await supabase
      .from("caixa_sessions")
      .select("id")
      .eq("jti", jti)
      .eq("user_id", expectedUserId)
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!session) return { valid: false, reason: "session_not_found_or_expired" };
    return { valid: true, jti };
  } catch (e) {
    return { valid: false, reason: `verify_error: ${(e as Error).message}` };
  }
}

// ── Action handlers ───────────────────────────────────────

async function handleListTx(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("caixa_tx")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

async function handleSaveTx(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const { transactions } = payload as { transactions: unknown[] };
  if (!Array.isArray(transactions)) throw new Error("transactions must be an array");

  // Upsert all in one operation
  const rows = transactions.map((t: unknown) => ({ ...(t as object), user_id: userId }));
  const { data, error } = await supabase
    .from("caixa_tx")
    .upsert(rows, { onConflict: "id" })
    .select();
  if (error) throw error;
  return data;
}

async function handleDeleteTx(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const { id } = payload as { id: string };
  const { error } = await supabase
    .from("caixa_tx")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return { deleted: id };
}

async function handleGetSettings(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("user_id", userId)
    .like("key", "caixa_%");
  if (error) throw error;
  // Convert to object
  const out: Record<string, string> = {};
  for (const row of (data as { key: string; value: string }[] ?? [])) {
    out[row.key] = row.value;
  }
  return out;
}

async function handleSetSettings(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const { key, value } = payload as { key: string; value: string };
  if (!key?.startsWith("caixa_")) throw new Error("Only caixa_ settings allowed");
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
  return { ok: true };
}

async function handleRevokeSession(supabase: ReturnType<typeof createClient>, userId: string, jti: string) {
  await supabase
    .from("caixa_sessions")
    .update({ revoked: true })
    .eq("jti", jti)
    .eq("user_id", userId);
  await supabase.from("caixa_audit").insert({
    user_id: userId, event: "session_revoked", meta: { jti },
  });
  return { ok: true };
}

// ── Main handler ──────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  // Also accept token from cookie for browser requests
  const caixaTokenHeader = req.headers.get("x-caixa-token");
  const caixaTokenCookie = req.headers.get("cookie")
    ?.split(";")
    .find(c => c.trim().startsWith("caixa_session="))
    ?.split("=")[1]
    ?.trim();
  const caixaToken = caixaTokenHeader ?? caixaTokenCookie;

  if (!caixaToken) return json({ error: "Missing caixa session token", code: "CAIXA_LOCKED" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Verify Supabase user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Invalid session" }, 401);
  const userId = user.id;

  // Verify step-up token
  const { valid, jti, reason } = await verifyStepUpToken(caixaToken, userId, supabase);
  if (!valid) {
    await supabase.from("caixa_audit").insert({
      user_id: userId, event: "session_expired", meta: { reason },
    });
    return json({ error: "Caixa session expired or invalid", code: "CAIXA_LOCKED", reason }, 401);
  }

  // Parse action
  let body: { action: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 422); }
  const { action, payload = {} } = body;

  try {
    let result: unknown;
    switch (action) {
      case "list_tx":      result = await handleListTx(supabase, userId, payload);          break;
      case "save_tx":      result = await handleSaveTx(supabase, userId, payload);          break;
      case "delete_tx":    result = await handleDeleteTx(supabase, userId, payload);        break;
      case "get_settings": result = await handleGetSettings(supabase, userId);              break;
      case "set_settings": result = await handleSetSettings(supabase, userId, payload);     break;
      case "revoke":       result = await handleRevokeSession(supabase, userId, jti!);      break;
      case "check":        result = { valid: true, expires_at: null };                      break;
      default: return json({ error: `Unknown action: ${action}` }, 400);
    }
    return json({ data: result });
  } catch (err) {
    console.error("[caixa-data] error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
