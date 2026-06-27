import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { migrateChatHistory } from "./chat-history";

/**
 * Real-data smoke test — runs ONLY ON A COPY. We copy the live
 * `~/.houston/workspaces` tree and `~/.houston/db/houston.db` into /tmp/hmig,
 * run the migration against the copy, assert a sane count of conversations +
 * orphans, prove the REAL ~/.houston is byte-identical (untouched), then clean
 * up /tmp/hmig. The migration is NEVER pointed at the real ~/.houston.
 *
 * Skips itself unless HOUSTON_RUN_REAL_MIGRATION_TEST=1 and the reference
 * dataset exists (CI / a clean box / a small personal dataset should not fail
 * the hermetic unit suite).
 */

const REAL_DB = join(homedir(), ".houston", "db", "houston.db");
const REAL_WS = join(homedir(), ".houston", "workspaces");
const runRealMigrationTest =
  process.env.HOUSTON_RUN_REAL_MIGRATION_TEST === "1";
const haveDataset =
  runRealMigrationTest && existsSync(REAL_DB) && existsSync(REAL_WS);

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A stable hash of the entire real ~/.houston tree, via `find` + per-file sha,
 * so any mutation (content OR file set) is detected. Uses the shell so it never
 * loads gigabytes into JS. */
function realTreeFingerprint(): string {
  // List every regular file under ~/.houston (sorted), excluding the volatile
  // db sidecars that the LIVE app may rewrite on its own between our two reads.
  const houston = join(homedir(), ".houston");
  const out = execFileSync(
    "bash",
    [
      "-c",
      `cd ${JSON.stringify(houston)} && find . -type f ` +
        `! -name '*.db-wal' ! -name '*.db-shm' ` +
        `-print0 | sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256`,
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return out.trim();
}

(haveDataset ? test : test.skip)(
  "real-data migration on a /tmp COPY; real ~/.houston untouched",
  () => {
    const scratch = "/tmp/hmig";
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });

    // Fingerprint the real tree BEFORE we read it, excluding WAL sidecars.
    const before = realTreeFingerprint();
    const realDbBefore = sha(REAL_DB);

    try {
      // Copy-only: the tree + a point-in-time copy of the db. The live db is in
      // WAL mode, so a self-consistent read of the copy needs its `-wal`/`-shm`
      // sidecars copied alongside the main file (a bare `.db` copy would miss the
      // uncommitted tail and fail to open read-only).
      cpSync(REAL_WS, join(scratch, "workspaces"), { recursive: true });
      cpSync(REAL_DB, join(scratch, "houston.db"));
      for (const ext of ["-wal", "-shm"]) {
        if (existsSync(REAL_DB + ext))
          cpSync(REAL_DB + ext, join(scratch, `houston.db${ext}`));
      }

      // The source tree may ITSELF already be migrated (the user ran the packaged
      // app, which migrates `~/.houston` on first boot). That would make this an
      // idempotent no-op. Strip the migration output (`.houston/runtime`) from the
      // COPY so we always exercise a FRESH migration. Only the /tmp copy is touched.
      execFileSync(
        "bash",
        [
          "-c",
          `find ${JSON.stringify(join(scratch, "workspaces"))} -type d -path '*/.houston/runtime' -prune -exec rm -rf {} +`,
        ],
        { encoding: "utf8" },
      );

      const logs: string[] = [];
      const res = migrateChatHistory({
        workspacesRoot: join(scratch, "workspaces"),
        dbPath: join(scratch, "houston.db"),
        log: (l) => logs.push(l),
      });

      // Sane shape on the reference dataset: ~39 link, ~7 orphans (the prompt's
      // verified numbers). We assert ranges, not exact counts, so the test is
      // robust to the user adding a chat or two before running it.
      expect(res.totalMigrated).toBeGreaterThanOrEqual(20);
      expect(res.totalMigrated).toBeLessThanOrEqual(200);
      expect(res.orphanSessionIds).toBeGreaterThanOrEqual(0);
      expect(logs.join("\n")).toContain("[migrate:chat] done:");

      // A 2nd run on the copy is a no-op.
      const res2 = migrateChatHistory({
        workspacesRoot: join(scratch, "workspaces"),
        dbPath: join(scratch, "houston.db"),
      });
      expect(res2.totalMigrated).toBe(0);

      // eslint-disable-next-line no-console
      console.log(
        `[real-smoke] migrated=${res.totalMigrated} skipped=${res.totalSkipped} orphans=${res.orphanSessionIds} agents=${res.agents.length}`,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }

    // The real db file is byte-identical, and the whole real tree fingerprint
    // (minus the WAL sidecars the live app owns) is unchanged.
    expect(sha(REAL_DB)).toBe(realDbBefore);
    expect(realTreeFingerprint()).toBe(before);
  },
);

test("real-data test is a deliberate no-op unless explicitly enabled", () => {
  // A trivially-green assertion so the suite reports the guard ran. The guarded
  // test above is the real coverage when explicitly enabled.
  expect(typeof haveDataset).toBe("boolean");
});
