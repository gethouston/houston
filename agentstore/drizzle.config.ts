import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for the Agent Store database.
 *
 * `migrate` applies the hand-authored SQL in ./drizzle (0000_init.sql owns the
 * triggers, generated column, and DEFERRABLE FK that the generator can't emit).
 * Do not run `generate` against this schema — it would try to re-derive a
 * migration and drop that hand-authored DDL.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.AGENTSTORE_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
