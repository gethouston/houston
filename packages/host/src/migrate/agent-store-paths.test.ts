import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { LEGACY_SETUP_BEGIN, LEGACY_SETUP_END } from "@houston/domain";
import { afterEach, expect, test } from "vitest";
import { AGENT_STORE_MIGRATION_PATHS, migrateAgentStore } from "./agent-store";

const AGENT = join("Personal", "Ledger");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

const FIXTURE: Record<string, string> = {
  "CLAUDE.md": `# Ledger\n\n${LEGACY_SETUP_BEGIN}\nSend ONE email.\n${LEGACY_SETUP_END}\n`,
  "GROUP.md": "# Group\n",
  ".houston/activity.json": '[{"id":"flat"}]',
  ".houston/activity/activity.json": '[{"id":"family"}]',
  ".houston/routines.json": '[{"id":"r1","schedule":"0 9 * * *"}]',
  ".houston/config.json": '{"model":"opus"}',
  ".houston/memory/learnings.md": "- Prefers short replies\n",
  ".houston/routine_runs.json": '[{"id":"run1"}]',
  ".houston/prompts/system.md": "old prompt",
  ".houston/prompts/self-improvement.md": "old prompt",
  ".houston/routines/routines.schema.json": '{"stale":true}',
  ".houston/backups/2026-09-29/snapshot.tgz": "tarball",
  ".houston/sessions/claude/s1.json": "{}",
  ".houston/runtime/auth.json": "{}",
  "report.pdf": "pdf",
};

function tree(agentRoot: string, dir = agentRoot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, tree(agentRoot, path));
    else
      out[relative(agentRoot, path).split(sep).join("/")] = readFileSync(
        path,
        "utf8",
      );
  }
  return out;
}

const comparable = (files: Record<string, string>) => {
  const key = ".houston/learnings/learnings.json";
  const learnings = files[key];
  if (learnings === undefined) return files;
  const entries = JSON.parse(learnings) as { text: string }[];
  return { ...files, [key]: entries.map((entry) => entry.text).join("\n") };
};

const MOVED_LEARNINGS: Record<string, string> = {
  ...FIXTURE,
  ".houston/learnings/learnings.json": '[{"id":"l1","text":"Kept"}]',
};

async function migrated(
  fixture: Record<string, string>,
  admit: (rel: string) => boolean,
) {
  const workspacesRoot = mkdtempSync(join(tmpdir(), "agent-store-paths-"));
  roots.push(workspacesRoot);
  const agentRoot = join(workspacesRoot, AGENT);
  for (const [rel, content] of Object.entries(fixture)) {
    if (!admit(rel)) continue;
    const path = join(agentRoot, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  const report = await migrateAgentStore({
    workspacesRoot,
    agentRoot,
    ownerSub: "owner-1",
    log: () => {},
  });
  return { report, files: comparable(tree(agentRoot)) };
}

test.each([
  ["a legacy agent", FIXTURE],
  ["an agent whose learnings already moved", MOVED_LEARNINGS],
])("%s migrates the same over the admitted files as over the whole agent", async (_, fixture) => {
  const whole = await migrated(fixture, () => true);
  const admitted = await migrated(fixture, (rel) =>
    AGENT_STORE_MIGRATION_PATHS.has(rel),
  );

  expect(admitted.report).toEqual(whole.report);
  expect(whole.report.layoutFiles).toBeGreaterThan(0);
  const untouched = Object.keys(fixture).filter(
    (rel) => !AGENT_STORE_MIGRATION_PATHS.has(rel),
  );
  const wholeAdmitted = Object.fromEntries(
    Object.entries(whole.files).filter(([rel]) => !untouched.includes(rel)),
  );
  expect(admitted.files).toEqual(wholeAdmitted);
  for (const rel of untouched) expect(whole.files[rel]).toBe(fixture[rel]);
  for (const rel of Object.keys(whole.files))
    expect(
      AGENT_STORE_MIGRATION_PATHS.has(rel) || untouched.includes(rel),
    ).toBe(true);
});
