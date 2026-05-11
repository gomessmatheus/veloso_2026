-- ============================================================
-- Migration: 20260511000000_caixa_step_up_auth.sql
-- Caixa step-up authentication — credentials, audit, rate-limit,
-- RLS on caixa_tx and caixa settings.
--
-- Run via: supabase db push  OR  supabase migration up
-- ============================================================

-- Requires pgcrypto for gen_random_uuid (already enabled on Supabase)
create extension if not exists pgcrypto;

-- ──────────────────────────────────────────────────────────
-- 1. CAIXA_CREDENTIALS
--    password_hash = bcrypt(cost=12) — never plaintext
-- ──────────────────────────────────────────────────────────
create table if not exists public.caixa_credentials (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         not null unique
                               references auth.users(id) on delete cascade,
  password_hash text         not null,
  updated_at    timestamptz  not null default now()
);

alter table public.caixa_credentials enable row level security;

-- Only the owner can read their own credential row (hash never leaves server,
-- but the row existence can be checked client-side to know if setup is needed)
create policy "caixa_credentials_self_read"
  on public.caixa_credentials
  for select
  using (auth.uid() = user_id);

-- Inserts/updates go only through Edge Functions using service role —
-- no client-side mutation allowed.

-- ──────────────────────────────────────────────────────────
-- 2. CAIXA_UNLOCK_ATTEMPTS  (rate limiting)
-- ──────────────────────────────────────────────────────────
create table if not exists public.caixa_unlock_attempts (
  id         bigserial    primary key,
  user_id    uuid         not null references auth.users(id) on delete cascade,
  ip         text,
  success    boolean      not null default false,
  created_at timestamptz  not null default now()
);

alter table public.caixa_unlock_attempts enable row level security;
-- All writes happen from service role (Edge Function) only — no client access.

-- Index for fast rate-limit lookup
create index if not exists idx_caixa_attempts_user_ts
  on public.caixa_unlock_attempts(user_id, created_at desc);

-- Auto-cleanup: keep only last 30 days to avoid unbounded growth
create or replace function public.cleanup_old_caixa_attempts()
returns void language sql security definer as $$
  delete from public.caixa_unlock_attempts
  where created_at < now() - interval '30 days';
$$;

-- ──────────────────────────────────────────────────────────
-- 3. CAIXA_AUDIT  (immutable event log)
-- ──────────────────────────────────────────────────────────
create table if not exists public.caixa_audit (
  id       bigserial    primary key,
  user_id  uuid         references auth.users(id) on delete set null,
  event    text         not null,   -- 'unlock_success' | 'unlock_failure' | etc.
  meta     jsonb        default '{}'::jsonb,
  at       timestamptz  not null default now()
);

alter table public.caixa_audit enable row level security;

-- Admins can read their own audit log
create policy "caixa_audit_self_read"
  on public.caixa_audit
  for select
  using (auth.uid() = user_id);

-- Writes only from service role (Edge Functions).

create index if not exists idx_caixa_audit_user_at
  on public.caixa_audit(user_id, at desc);

-- ──────────────────────────────────────────────────────────
-- 4. SESSION TOKEN STORE  (server-side token registry)
--    Allows server-side invalidation and single-use verification.
-- ──────────────────────────────────────────────────────────
create table if not exists public.caixa_sessions (
  id         uuid         primary key default gen_random_uuid(),
  user_id    uuid         not null references auth.users(id) on delete cascade,
  jti        text         not null unique,  -- JWT ID — used to revoke specific tokens
  expires_at timestamptz  not null,
  revoked    boolean      not null default false,
  created_at timestamptz  not null default now()
);

alter table public.caixa_sessions enable row level security;
-- All access via service role only.

create index if not exists idx_caixa_sessions_jti
  on public.caixa_sessions(jti) where not revoked;

create index if not exists idx_caixa_sessions_user_exp
  on public.caixa_sessions(user_id, expires_at desc) where not revoked;

-- Function to revoke all active sessions for a user
-- (called on password change or suspicious activity)
create or replace function public.revoke_caixa_sessions(p_user_id uuid)
returns void language sql security definer as $$
  update public.caixa_sessions
  set revoked = true
  where user_id = p_user_id and not revoked;
$$;

-- ──────────────────────────────────────────────────────────
-- 5. RLS ON caixa_tx
--    Unlock is checked via a DB function that validates the
--    step-up session stored in caixa_sessions.
-- ──────────────────────────────────────────────────────────

-- Helper: verify caixa session token passed as app setting
-- The Edge Function (caixa-data) sets 'app.caixa_jti' before running queries.
create or replace function public.is_caixa_unlocked()
returns boolean language plpgsql security definer stable as $$
declare
  v_jti     text;
  v_valid   boolean;
begin
  v_jti := current_setting('app.caixa_jti', true);
  if v_jti is null or v_jti = '' then
    return false;
  end if;
  select exists(
    select 1 from public.caixa_sessions
    where jti       = v_jti
      and user_id   = auth.uid()
      and not revoked
      and expires_at > now()
  ) into v_valid;
  return coalesce(v_valid, false);
end;
$$;

-- NOTE: caixa_tx must already exist (created by app bootstrap).
-- Add RLS if not already enabled:
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'caixa_tx'
  ) then
    alter table public.caixa_tx enable row level security;

    -- Drop old permissive policies if any
    drop policy if exists "caixa_tx_owner"     on public.caixa_tx;
    drop policy if exists "caixa_tx_select"    on public.caixa_tx;
    drop policy if exists "caixa_tx_insert"    on public.caixa_tx;
    drop policy if exists "caixa_tx_update"    on public.caixa_tx;
    drop policy if exists "caixa_tx_delete"    on public.caixa_tx;

    -- New policies: require step-up session
    execute $p$
      create policy "caixa_tx_select"
        on public.caixa_tx for select
        using (auth.uid() = user_id and public.is_caixa_unlocked());
    $p$;
    execute $p$
      create policy "caixa_tx_insert"
        on public.caixa_tx for insert
        with check (auth.uid() = user_id and public.is_caixa_unlocked());
    $p$;
    execute $p$
      create policy "caixa_tx_update"
        on public.caixa_tx for update
        using (auth.uid() = user_id and public.is_caixa_unlocked());
    $p$;
    execute $p$
      create policy "caixa_tx_delete"
        on public.caixa_tx for delete
        using (auth.uid() = user_id and public.is_caixa_unlocked());
    $p$;
  end if;
end;
$$;

-- ──────────────────────────────────────────────────────────
-- 6. RLS ON settings rows for caixa_base / caixa_base_date
--    Assumes a `settings (key, value, user_id)` table pattern.
-- ──────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'settings'
  ) then
    -- Only lock caixa-prefixed keys; other settings remain accessible normally
    drop policy if exists "settings_caixa_select" on public.settings;
    drop policy if exists "settings_caixa_upsert" on public.settings;

    execute $p$
      create policy "settings_caixa_select"
        on public.settings for select
        using (
          auth.uid() = user_id and (
            -- Non-caixa keys: normal access
            not (key like 'caixa_%')
            -- caixa keys: require step-up
            or (key like 'caixa_%' and public.is_caixa_unlocked())
          )
        );
    $p$;
    execute $p$
      create policy "settings_caixa_upsert"
        on public.settings for insert
        with check (
          auth.uid() = user_id and (
            not (key like 'caixa_%')
            or (key like 'caixa_%' and public.is_caixa_unlocked())
          )
        );
    $p$;
  end if;
end;
$$;

-- ──────────────────────────────────────────────────────────
-- 7. GRANT minimal permissions
-- ──────────────────────────────────────────────────────────
grant usage on schema public to authenticated;
grant select on public.caixa_credentials to authenticated;
grant select on public.caixa_audit       to authenticated;
-- caixa_sessions: no direct client access (service role only)
-- caixa_unlock_attempts: no direct client access (service role only)
