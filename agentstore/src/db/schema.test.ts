import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  agentInstalls,
  agentState,
  agents,
  agentVersions,
  agentVisibility,
  categories,
  installTarget,
  integrationsCatalog,
} from "./schema";

// The hand-authored migration is the source of truth for the physical schema;
// schema.ts is its type mirror. These tests fail the moment the two drift, which
// is the whole reason the DDL is maintained by hand rather than generated.
const initSql = readFileSync(
  fileURLToPath(new URL("../../drizzle/0000_init.sql", import.meta.url)),
  "utf8",
);

const tables: PgTable[] = [
  categories,
  integrationsCatalog,
  agents,
  agentVersions,
  agentInstalls,
];

describe("schema ↔ migration consistency", () => {
  it.each(
    tables.map((t) => [getTableName(t), t] as const),
  )("table %s and every column exist in 0000_init.sql", (name, table) => {
    expect(initSql).toMatch(new RegExp(`CREATE TABLE ${name}\\b`));
    for (const column of Object.values(getTableColumns(table))) {
      expect(
        new RegExp(`\\b${column.name}\\b`).test(initSql),
        `column "${column.name}" of table "${name}" is missing from 0000_init.sql`,
      ).toBe(true);
    }
  });

  it.each([
    agentState,
    agentVisibility,
    installTarget,
  ])("enum $enumName and its values exist in 0000_init.sql", (enumDef) => {
    expect(initSql).toMatch(
      new RegExp(`CREATE TYPE ${enumDef.enumName} AS ENUM`),
    );
    for (const value of enumDef.enumValues) {
      expect(initSql).toContain(`'${value}'`);
    }
  });

  it("keeps the Postgres artifacts the generator cannot express", () => {
    // generated STORED search vector
    expect(initSql).toMatch(/search_tsv\s+tsvector GENERATED ALWAYS AS/);
    expect(initSql).toContain("STORED");
    // partial-unique slug index
    expect(initSql).toMatch(
      /CREATE UNIQUE INDEX agents_slug_uniq[\s\S]*WHERE slug IS NOT NULL/,
    );
    // DEFERRABLE self-referential FK
    expect(initSql).toContain("DEFERRABLE INITIALLY DEFERRED");
    // extensions
    expect(initSql).toContain("CREATE EXTENSION IF NOT EXISTS citext");
    expect(initSql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // updated_at + installs_count triggers
    expect(initSql).toContain("CREATE TRIGGER agents_set_updated_at");
    expect(initSql).toContain("CREATE TRIGGER agent_installs_count_ins");
    expect(initSql).toContain("CREATE TRIGGER agent_installs_count_del");
  });

  it("guards agents_set_updated_at so counter traffic never touches updated_at", () => {
    // updated_at means "last edit to the agent DEFINITION". The counter columns
    // (installs_count, views_count) are trigger-maintained by anonymous
    // download/view traffic; without a WHEN guard the BEFORE UPDATE trigger's
    // now() assignment would rewrite updated_at on every install, corrupting the
    // column that GET /api/agents/me and PATCH surface as updatedAt.
    expect(initSql).toMatch(
      /CREATE TRIGGER agents_set_updated_at BEFORE UPDATE ON agents[\s\S]*?WHEN \(/,
    );
    expect(initSql).toMatch(
      /OLD\.installs_count IS NOT DISTINCT FROM NEW\.installs_count/,
    );
    expect(initSql).toMatch(
      /OLD\.views_count IS NOT DISTINCT FROM NEW\.views_count/,
    );
  });

  it("exposes the pinned drizzle export names", () => {
    expect(getTableName(agents)).toBe("agents");
    expect(getTableName(agentVersions)).toBe("agent_versions");
    expect(getTableName(agentInstalls)).toBe("agent_installs");
    expect(getTableName(categories)).toBe("categories");
    expect(getTableName(integrationsCatalog)).toBe("integrations_catalog");
  });
});
