import { readFileSync } from "node:fs";
import { Client } from "pg";

/**
 * One-off migration runner: applies a SQL file to CP_DATABASE_URL inside a
 * transaction. Used for the additive workspaces.runtime column on the live
 * Supabase DB (no psql in the deploy environment). Idempotent SQL only.
 *
 *   CP_DATABASE_URL=... pnpm exec tsx scripts/run-migration.ts <path-to.sql>
 */
const url = process.env.CP_DATABASE_URL;
const file = process.argv[2];
if (!url) throw new Error("CP_DATABASE_URL is required");
if (!file) throw new Error("usage: run-migration.ts <path-to.sql>");

const sql = readFileSync(file, "utf8");
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`applied ${file}`);
  const { rows } = await client.query(
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='workspaces' AND column_name='runtime'",
  );
  console.log("verify:", JSON.stringify(rows));
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
