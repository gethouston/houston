-- Kind POC migrations — runs against plain Postgres (no Supabase).
-- Creates the auth schema compatibility layer so the original migrations
-- (which reference auth.users) work unchanged.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-insert the POC user so the FK in workspaces is satisfied when the
-- control plane's PgWorkspaceStore creates a personal workspace on first login.
-- The service token in CP_SERVICE_TOKENS maps to this user id.
INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;

-- 20260607000000_cloud_workspaces.sql
CREATE TABLE IF NOT EXISTS public.workspaces (
  id            text   PRIMARY KEY,
  owner_user_id uuid   NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind          text   NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'org')),
  name          text   NOT NULL,
  slug          text   NOT NULL,
  created_at    bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_personal_per_owner_idx
  ON public.workspaces (owner_user_id)
  WHERE kind = 'personal';

CREATE TABLE IF NOT EXISTS public.agents (
  id           text   PRIMARY KEY,
  workspace_id text   NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name         text   NOT NULL,
  created_at   bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS agents_workspace_id_idx
  ON public.agents (workspace_id);

-- 20260608000000_workspace_credentials.sql
CREATE TABLE IF NOT EXISTS public.workspace_credentials (
  workspace_id  text   NOT NULL,
  provider      text   NOT NULL,
  access_token  text   NOT NULL,
  refresh_token text   NOT NULL,
  account_id    text,
  expires_at    bigint NOT NULL,
  updated_at    bigint NOT NULL,
  PRIMARY KEY (workspace_id, provider)
);

-- 20260610000000_workspace_runtime.sql
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS runtime TEXT NOT NULL DEFAULT 'gke'
  CHECK (runtime IN ('gke', 'cloudrun'));

-- Seed: fixed dev workspace for the service-token POC user.
-- Fixed ID lets deploy.sh pre-seed provider credentials without a two-step
-- "login first, then look up workspace ID" dance. The partial unique index
-- (owner_user_id WHERE kind='personal') prevents duplicates if the CP also
-- tries to create one; it finds this row on the fast-path instead.
INSERT INTO public.workspaces (id, owner_user_id, kind, name, slug, runtime, created_at)
VALUES ('ws_devpoc', '00000000-0000-0000-0000-000000000001', 'personal', 'Personal', 'poc-dev', 'gke', 0)
ON CONFLICT DO NOTHING;

-- 20260623000000_integration_credentials.sql
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  user_id    text  NOT NULL,
  provider   text  NOT NULL,
  data       jsonb NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, provider)
);
