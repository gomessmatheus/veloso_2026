/**
 * supabase/functions/caixa-set-password/index.ts
 *
 * Set or change the Caixa step-up password for the authenticated user.
 *
 * Request:  POST { password: string, current_password?: string }
 *           Authorization: Bearer <supabase_user_jwt>
 *
 *   - First-time setup: current_password is not required (but caller must
 *     have role='admin' — verified via auth.users.raw_app_meta_data).
 *   - Password change: current_password MUST be correct.
 *
 * Response 200: { ok: true }
 * Response 400: validation error
 * Response 401: wrong current_password or not authorized
 * Response 422: missing fields
 */

import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt       from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN   = Deno.env.get("SITE_URL") || "https://veloso-2026.vercel.app";
const BCRYPT_COST      = 12;
const MIN_LENGTH       = 8;
const MAX_LENGTH       = 128;

const corsHeaders = {
  "Access-Control-Allow-Origin":      ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":     "authorization, content-type",
  "Access-Control-Allow-Methods":     "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Invalid session" }, 401);
  const userId  = user.id;
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Only admin role can set a caixa password
  const role = user.app_metadata?.role ?? "viewer";
  if (role !== "admin") return json({ error: "Forbidden: admin only" }, 403);

  let body: { password?: string; current_password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 422); }

  const { password, current_password } = body ?? {};

  if (typeof password !== "string") return json({ error: "password required" }, 422);
  if (password.length < MIN_LENGTH)  return json({ error: `Password must be at least ${MIN_LENGTH} characters` }, 400);
  if (password.length > MAX_LENGTH)  return json({ error: "Password too long" }, 400);

  // Check if credential already exists
  const { data: existing } = await supabase
    .from("caixa_credentials")
    .select("password_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    // Password change: verify current password first
    if (typeof current_password !== "string" || current_password.length < 1) {
      return json({ error: "current_password required to change password" }, 422);
    }
    const ok = await bcrypt.compare(current_password, existing.password_hash);
    if (!ok) {
      await supabase.from("caixa_audit").insert({
        user_id: userId,
        event:   "unlock_failure",
        meta:    { context: "password_change_wrong_current", ip: clientIp },
      });
      return json({ error: "Current password is incorrect" }, 401);
    }
  }

  // Hash new password
  const newHash = await bcrypt.hash(password, BCRYPT_COST);

  if (existing) {
    await supabase
      .from("caixa_credentials")
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } else {
    await supabase
      .from("caixa_credentials")
      .insert({ user_id: userId, password_hash: newHash });
  }

  // Revoke all existing sessions on password change (security: force re-auth)
  if (existing) {
    await supabase.rpc("revoke_caixa_sessions", { p_user_id: userId });
  }

  await supabase.from("caixa_audit").insert({
    user_id: userId,
    event:   existing ? "password_changed" : "password_set",
    meta:    { ip: clientIp },
  });

  return json({ ok: true });
});
