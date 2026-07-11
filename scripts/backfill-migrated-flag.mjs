#!/usr/bin/env node
// One-time cutover backfill for the cloud-migration gate (HOU-719).
//
// The desktop wizard reads `user_metadata.migrated` (app/src/lib/migration-status.ts):
//   false  → existing local-app user, offer the migration wizard
//   true   → done (migrated, or a new user past onboarding)
//   absent → a brand-NEW cloud user → normal onboarding
//
// For "absent = new" to hold, the ENTIRE existing user base must be stamped
// before the cloud app ships. This walks every Supabase user and sets:
//   - migrated:true   if they already finished (migration_status === "completed")
//   - migrated:false  otherwise
// Users who already carry a `migrated` boolean are left untouched (idempotent).
//
// Usage (dry-run prints the plan and changes nothing):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-migrated-flag.mjs
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-migrated-flag.mjs --apply
//
// The SERVICE ROLE key is admin-scoped — never commit it, pass it via env only.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!URL || !KEY) {
  console.error(
    "ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (admin key) in the env.",
  );
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Decide the target flag for one user; null = leave untouched. */
function target(user) {
  const meta = user.user_metadata ?? {};
  if (typeof meta.migrated === "boolean") return null; // already stamped
  return meta.migration_status === "completed";
}

async function main() {
  const summary = {
    scanned: 0,
    setTrue: 0,
    setFalse: 0,
    skipped: 0,
    failed: 0,
  };
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(`listUsers page ${page} failed: ${error.message}`);
      process.exit(1);
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      summary.scanned++;
      const want = target(user);
      if (want === null) {
        summary.skipped++;
        continue;
      }
      const countKey = want ? "setTrue" : "setFalse";
      if (!APPLY) {
        summary[countKey]++;
        continue;
      }
      const { error: upErr } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, migrated: want },
      });
      if (upErr) {
        summary.failed++;
        console.error(`  update ${user.id} failed: ${upErr.message}`);
      } else {
        summary[countKey]++;
      }
    }
    if (users.length < perPage) break;
  }

  const mode = APPLY ? "APPLIED" : "DRY-RUN (pass --apply to write)";
  console.log(`\n${mode}`);
  console.table(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
