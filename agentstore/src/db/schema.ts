// ============================================================================
// Houston Agent Store — Drizzle schema (all v1 tables).
//
// The DB module owns this file. It is the type-accurate query surface for
// `import * as schema from "@/db/schema"`. Postgres artifacts that Drizzle's DSL
// cannot fully model — the citext/pg_trgm extensions, partial-index predicates,
// the DEFERRABLE published_version FK, the updated_at trigger, and the
// installs_count counter trigger — are hand-authored in drizzle/0000_init.sql.
// The definitions below stay byte-for-byte aligned with that DDL (enforced by
// schema.test.ts).
// ============================================================================

import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ----------------------------------------------------------------------------
// custom column types
// ----------------------------------------------------------------------------

/** citext = case-insensitive text. Requires `create extension citext` (migration). */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

/** tsvector — the generated search column (declared GENERATED … STORED in SQL). */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// ----------------------------------------------------------------------------
// enums
// ----------------------------------------------------------------------------

export const agentState = pgEnum("agent_state", [
  "draft",
  "published",
  "archived",
]);

export const agentVisibility = pgEnum("agent_visibility", [
  "unlisted",
  "public",
]);

export const installTarget = pgEnum("install_target", [
  "claude_skill_zip",
  "copy_paste",
  "houston",
]);

// ----------------------------------------------------------------------------
// shared column helpers
// ----------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ============================================================================
// categories — controlled vocabulary for agents.category
// ============================================================================

export const categories = pgTable("categories", {
  id: id(),
  slug: citext("slug").notNull().unique(),
  name: text("name").notNull(),
  iconUrl: text("icon_url"),
  position: integer("position").notNull().default(0),
});

// ============================================================================
// integrations_catalog — Composio toolkit reference (UPPERCASE slugs)
// ============================================================================

export const integrationsCatalog = pgTable("integrations_catalog", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  iconUrl: text("icon_url"),
  category: text("category"),
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
});

// ============================================================================
// agents — the catalog row; identity fields denormalized from the latest IR
// ============================================================================

export const agents = pgTable(
  "agents",
  {
    id: id(),
    // NULL until first publish; finalized (and unique) at publish time.
    slug: citext("slug"),
    name: text("name").notNull(),
    tagline: text("tagline"),
    description: text("description").notNull(),
    iconKind: text("icon_kind"),
    iconValue: text("icon_value"),
    color: text("color"),
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    integrations: text("integrations")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    creatorDisplayName: text("creator_display_name").notNull(),
    creatorUrl: text("creator_url"),
    // SHA-256 hex of the bearer manage token. The row's only auth credential.
    manageTokenHash: text("manage_token_hash").notNull().unique(),
    supabaseUserId: text("supabase_user_id"),
    state: agentState("state").notNull().default("draft"),
    visibility: agentVisibility("visibility").notNull().default("unlisted"),
    publicRequestedAt: timestamp("public_requested_at", { withTimezone: true }),
    // FK to agent_versions added DEFERRABLE INITIALLY DEFERRED in the migration
    // (the two tables reference each other — insert order needs the deferral).
    publishedVersionId: uuid("published_version_id"),
    viewsCount: integer("views_count").notNull().default(0),
    // Maintained exclusively by the agent_installs counter trigger. App code
    // must NEVER write this column.
    installsCount: integer("installs_count").notNull().default(0),
    // Generated STORED tsvector (name=A, tagline=B, description=C). The real
    // expression lives in the migration; declared here so it is part of the
    // typed surface and omitted from inserts.
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("name", '')), 'A') || setweight(to_tsvector('english', coalesce("tagline", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // slug is globally unique among live agents; many NULLs (drafts) coexist.
    uniqueIndex("agents_slug_uniq")
      .on(t.slug)
      .where(sql`${t.slug} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index("agents_search").using("gin", t.searchTsv),
    index("agents_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

// ============================================================================
// agent_versions — immutable IR snapshots, one row per version bump
// ============================================================================

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: id(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    ir: jsonb("ir").notNull(),
    irVersion: text("ir_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agent_versions_uniq").on(t.agentId, t.version),
    index("agent_versions_agent").on(t.agentId, t.version.desc()),
  ],
);

// ============================================================================
// agent_installs — anonymous install/download events (counter via trigger)
// ============================================================================

export const agentInstalls = pgTable(
  "agent_installs",
  {
    id: id(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => agentVersions.id, {
      onDelete: "set null",
    }),
    target: installTarget("target").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_installs_agent").on(t.agentId, t.createdAt.desc(), t.id),
  ],
);

// ============================================================================
// Inferred row types
// ============================================================================

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type IntegrationCatalogEntry = typeof integrationsCatalog.$inferSelect;
export type NewIntegrationCatalogEntry =
  typeof integrationsCatalog.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
export type AgentInstall = typeof agentInstalls.$inferSelect;
export type NewAgentInstall = typeof agentInstalls.$inferInsert;
