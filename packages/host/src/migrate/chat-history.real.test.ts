import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { migrateChatHistory } from "./chat-history";

const REAL_DB = join(homedir(), ".houston", "db", "houston.db");
const REAL_WS = join(homedir(), ".houston", "workspaces");
const runRealMigrationTest =
  process.env.HOUSTON_RUN_REAL_MIGRATION_TEST === "1";
const haveDataset =
  runRealMigrationTest && existsSync(REAL_DB) && existsSync(REAL_WS);

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function realTreeFingerprint(): string {
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

    const before = realTreeFingerprint();
    const realDbBefore = sha(REAL_DB);

    try {
      cpSync(REAL_WS, join(scratch, "workspaces"), { recursive: true });
      cpSync(REAL_DB, join(scratch, "houston.db"));
      for (const ext of ["-wal", "-shm"]) {
        if (existsSync(REAL_DB + ext))
          cpSync(REAL_DB + ext, join(scratch, `houston.db${ext}`));
      }

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

      expect(res.totalMigrated).toBeGreaterThanOrEqual(20);
      expect(res.totalMigrated).toBeLessThanOrEqual(200);
      expect(res.orphanSessionIds).toBeGreaterThanOrEqual(0);
      expect(logs.join("\n")).toContain("[migrate:chat] done:");

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

    expect(sha(REAL_DB)).toBe(realDbBefore);
    expect(realTreeFingerprint()).toBe(before);
  },
);

test("real-data test is a deliberate no-op unless explicitly enabled", () => {
  expect(typeof haveDataset).toBe("boolean");
});
