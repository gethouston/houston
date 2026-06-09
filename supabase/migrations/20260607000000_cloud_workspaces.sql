-- 20260607000000_cloud_workspaces.sql — Houston Cloud control-plane tenancy.
--
-- ADDITIVE migration for the EXISTING Supabase project (the same one that holds
-- ~700 users via 20260424000000_profiles.sql). It NEVER touches auth.users or
-- public.profiles — their RLS policies and trigger stay exactly as shipped.
--
-- Tenancy model (free personal tier): one user owns one personal Workspace of
-- unlimited Agents. The owner sees and uses ALL of their agents. There are no
-- grants, roles, members, or sharing rows — the wall BETWEEN agents is the
-- per-agent sandbox (own volume + default-deny networking), not a permission row.
--
-- AUTHORIZATION is ownership, enforced in control-plane CODE on every request
-- (workspaces.owner_user_id === caller's Supabase user id), NOT via Postgres
-- Row-Level Security: the control plane is the sole reader/writer of these tables
-- and connects as a trusted service role, so RLS would add no defense and is
-- deliberately absent. owner_user_id === Supabase auth.users.id (the JWT "sub").
--
-- created_at is a unix-millis BIGINT to match the TS `number` field in
-- packages/control-plane/src/domain/types.ts (not a timestamptz). The paid
-- multiplayer "org" tier is deferred and modeled only by workspaces.kind.

create table if not exists public.workspaces (
  id            text primary key,
  owner_user_id uuid   not null references auth.users (id) on delete cascade,
  kind          text   not null default 'personal' check (kind in ('personal', 'org')),
  name          text   not null,
  slug          text   not null,
  created_at    bigint not null
);

-- One personal workspace per owner. A partial unique index makes
-- getOrCreatePersonalWorkspace race-safe (concurrent inserts collide here),
-- while leaving room for many future `org` workspaces per owner.
create unique index if not exists workspaces_one_personal_per_owner_idx
  on public.workspaces (owner_user_id)
  where kind = 'personal';

create table if not exists public.agents (
  id           text primary key,
  workspace_id text   not null references public.workspaces (id) on delete cascade,
  name         text   not null,
  created_at   bigint not null
);

-- Hot path: listing every agent in a workspace (the owner's full sidebar).
create index if not exists agents_workspace_id_idx
  on public.agents (workspace_id);
