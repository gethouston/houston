-- ============================================================================
-- Houston Agent Store — 0000_init
-- Full v1 DDL: extensions, enums, all tables, the generated STORED search_tsv,
-- GIN/trgm indexes, the partial-unique slug index, the DEFERRABLE
-- published_version FK, the updated_at trigger, and the installs_count counter
-- trigger.
--
-- Hand-authored DDL (drizzle-kit `migrate` applies *.sql in drizzle/). This is
-- the canonical 0000 baseline; do not regenerate it from the schema — the
-- generated column, partial predicates, deferral, and triggers below cannot be
-- expressed through drizzle-kit's generator. schema.ts stays aligned by hand
-- (asserted in src/db/schema.test.ts).
--
-- `--> statement-breakpoint` markers let drizzle-kit run each statement in its
-- own transaction.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- enums
-- ----------------------------------------------------------------------------
CREATE TYPE agent_state AS ENUM ('draft','published','archived');
--> statement-breakpoint
CREATE TYPE agent_visibility AS ENUM ('unlisted','public');
--> statement-breakpoint
CREATE TYPE install_target AS ENUM ('claude_skill_zip','copy_paste','houston');
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- shared updated_at trigger fn
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- ============================================================================
-- categories — controlled vocabulary for agents.category
-- ============================================================================
CREATE TABLE categories (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug     citext NOT NULL UNIQUE,
  name     text NOT NULL,
  icon_url text,
  position int NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- ============================================================================
-- integrations_catalog — Composio toolkit reference (UPPERCASE slugs)
-- ============================================================================
CREATE TABLE integrations_catalog (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug      text NOT NULL UNIQUE,   -- UPPERCASE Composio toolkit slug
  name      text NOT NULL,
  icon_url  text,
  category  text,
  is_active boolean NOT NULL DEFAULT true,
  position  int NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- ============================================================================
-- agents — the catalog row; identity fields denormalized from the latest IR
-- ============================================================================
CREATE TABLE agents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 citext,                 -- NULL until first publish
  name                 text NOT NULL,
  tagline              text,
  description          text NOT NULL,
  icon_kind            text,
  icon_value           text,
  color                text,
  category             text NOT NULL,
  tags                 text[] NOT NULL DEFAULT '{}',
  integrations         text[] NOT NULL DEFAULT '{}',
  creator_display_name text NOT NULL,
  creator_url          text,
  manage_token_hash    text NOT NULL UNIQUE,   -- SHA-256 hex of the manage token
  supabase_user_id     text,
  state                agent_state      NOT NULL DEFAULT 'draft',
  visibility           agent_visibility NOT NULL DEFAULT 'unlisted',
  public_requested_at  timestamptz,
  published_version_id uuid,                   -- FK added below (DEFERRABLE)
  views_count          int NOT NULL DEFAULT 0,
  installs_count       int NOT NULL DEFAULT 0, -- trigger-maintained; app never writes
  search_tsv           tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(tagline,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'C')) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
--> statement-breakpoint
-- slug is globally unique among live agents; drafts (slug NULL) coexist freely.
CREATE UNIQUE INDEX agents_slug_uniq ON agents (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX agents_search ON agents USING gin (search_tsv);
--> statement-breakpoint
CREATE INDEX agents_name_trgm ON agents USING gin (name gin_trgm_ops);
--> statement-breakpoint
-- updated_at tracks edits to the agent DEFINITION only. The counter columns
-- (installs_count, views_count) are trigger-maintained by anonymous traffic and
-- must NOT be treated as an edit, so the guard skips updates that touch nothing
-- but a counter. Without it, every anonymous download/view would rewrite
-- updated_at via this BEFORE trigger's now() assignment.
CREATE TRIGGER agents_set_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW
  WHEN (
    OLD.installs_count IS NOT DISTINCT FROM NEW.installs_count
    AND OLD.views_count IS NOT DISTINCT FROM NEW.views_count
  )
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ============================================================================
-- agent_versions — immutable IR snapshots, one row per version bump
-- ============================================================================
CREATE TABLE agent_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version    int  NOT NULL,
  ir         jsonb NOT NULL,             -- canonical IR snapshot (Zod-validated before insert)
  ir_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_versions_uniq UNIQUE (agent_id, version)
);
--> statement-breakpoint
CREATE INDEX agent_versions_agent ON agent_versions (agent_id, version DESC);
--> statement-breakpoint
ALTER TABLE agents ADD CONSTRAINT agents_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES agent_versions(id)
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- ============================================================================
-- agent_installs — anonymous install/download events
-- ============================================================================
CREATE TABLE agent_installs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES agent_versions(id) ON DELETE SET NULL,
  target     install_target NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX agent_installs_agent ON agent_installs (agent_id, created_at DESC, id);
--> statement-breakpoint

-- ============================================================================
-- installs_count counter — the ONLY writer of agents.installs_count.
-- AFTER INSERT increments, AFTER DELETE decrements (floored at 0). App code
-- never touches the counter; it inserts an agent_installs row and lets the DB
-- keep the tally self-consistent.
-- ============================================================================
CREATE OR REPLACE FUNCTION agent_installs_count() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE agents SET installs_count = installs_count + 1 WHERE id = NEW.agent_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE agents SET installs_count = GREATEST(installs_count - 1, 0) WHERE id = OLD.agent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_installs_count_ins AFTER INSERT ON agent_installs
  FOR EACH ROW EXECUTE FUNCTION agent_installs_count();
--> statement-breakpoint
CREATE TRIGGER agent_installs_count_del AFTER DELETE ON agent_installs
  FOR EACH ROW EXECUTE FUNCTION agent_installs_count();
