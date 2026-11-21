import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LEGACY_SETUP_BEGIN,
  LEGACY_SETUP_END,
  schemaDoc,
} from "@houston/domain";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  AGENT_STORE_MIGRATIONS,
  HOST_ONLY_MIGRATIONS,
  migrateAgentStore,
} from "./agent-store";

let workspacesRoot: string;
let agentRoot: string;
const noLog = () => {};

const write = (rel: string, content: string) => {
  const path = join(agentRoot, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
};
const read = (rel: string) => readFileSync(join(agentRoot, rel), "utf8");

beforeEach(() => {
  workspacesRoot = mkdtempSync(join(tmpdir(), "agent-store-"));
  agentRoot = join(workspacesRoot, "Personal", "Ledger");
  mkdirSync(join(agentRoot, ".houston"), { recursive: true });
});

afterEach(() => {
  rmSync(workspacesRoot, { recursive: true, force: true });
});

function legacyAgent() {
  write(".houston/activity.json", '[{"id":"a1","title":"Old card"}]');
  write(".houston/routines.json", '[{"id":"r1","schedule":"0 9 * * *"}]');
  write(".houston/config.json", '{"model":"opus"}');
  write(".houston/memory/learnings.md", "- Prefers short replies\n");
  write(
    "CLAUDE.md",
    `# Ledger\n\n${LEGACY_SETUP_BEGIN}\nSend ONE real email now.\n${LEGACY_SETUP_END}\n`,
  );
  write(".houston/routines/routines.schema.json", '{"stale":true}');
}

describe("migrateAgentStore", () => {
  test("a pre-v0.4 agent reads its old data from the family files and keeps the originals", async () => {
    legacyAgent();

    const report = await migrateAgentStore({
      workspacesRoot,
      agentRoot,
      ownerSub: "owner-1",
      log: noLog,
    });

    expect(JSON.parse(read(".houston/activity/activity.json"))).toEqual([
      { id: "a1", title: "Old card" },
    ]);
    expect(JSON.parse(read(".houston/config/config.json"))).toEqual({
      model: "opus",
    });
    const learnings = JSON.parse(read(".houston/learnings/learnings.json"));
    expect(learnings).toEqual([
      expect.objectContaining({ text: "Prefers short replies" }),
    ]);
    expect(JSON.parse(read(".houston/routines/routines.json"))).toEqual([
      { id: "r1", schedule: "0 9 * * *", created_by: "owner-1" },
    ]);
    expect(read(".houston/activity.json")).toBe(
      '[{"id":"a1","title":"Old card"}]',
    );
    expect(read(".houston/memory/learnings.md")).toBe(
      "- Prefers short replies\n",
    );
    expect(read("CLAUDE.md")).toBe("# Ledger\n");
    expect(read(".houston/routines/routines.schema.json")).toBe(
      schemaDoc("routines"),
    );
    expect(report).toEqual({
      layoutFiles: 4,
      schemaFiles: expect.any(Number),
      setupSections: 1,
      routinesStamped: 1,
    });
    expect(report.schemaFiles).toBeGreaterThan(0);
  });

  test("a second run changes nothing", async () => {
    legacyAgent();
    await migrateAgentStore({
      workspacesRoot,
      agentRoot,
      ownerSub: "owner-1",
      log: noLog,
    });
    const before = statSync(join(agentRoot, ".houston/routines/routines.json"));

    const report = await migrateAgentStore({
      workspacesRoot,
      agentRoot,
      ownerSub: "owner-1",
      log: noLog,
    });

    expect(report).toEqual({
      layoutFiles: 0,
      schemaFiles: 0,
      setupSections: 0,
      routinesStamped: 0,
    });
    const after = statSync(join(agentRoot, ".houston/routines/routines.json"));
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("a family file that exists already is never written over by its flat twin", async () => {
    write(".houston/activity.json", '[{"id":"old"}]');
    write(".houston/activity/activity.json", '[{"id":"new"}]');

    await migrateAgentStore({ workspacesRoot, agentRoot, log: noLog });

    expect(read(".houston/activity/activity.json")).toBe('[{"id":"new"}]');
  });

  test("with no owner the routines keep no creator, as on a desktop host", async () => {
    write(".houston/routines/routines.json", '[{"id":"r1"}]');

    const report = await migrateAgentStore({
      workspacesRoot,
      agentRoot,
      log: noLog,
    });

    expect(report.routinesStamped).toBe(0);
    expect(read(".houston/routines/routines.json")).toBe('[{"id":"r1"}]');
  });

  test("a malformed routines doc is left for the read path to report, not a failed migration", async () => {
    write(".houston/routines/routines.json", "{not json");

    const report = await migrateAgentStore({
      workspacesRoot,
      agentRoot,
      ownerSub: "owner-1",
      log: noLog,
    });

    expect(report.routinesStamped).toBe(0);
    expect(read(".houston/routines/routines.json")).toBe("{not json");
  });

  test("a stray folder beside the agent is not touched", async () => {
    const stray = join(workspacesRoot, "Personal", "Leftover");
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, "GROUP.md"), "not ours\n");
    write("GROUP.md", "the agent's gateway note\n");

    await migrateAgentStore({ workspacesRoot, agentRoot, log: noLog });

    expect(existsSync(join(agentRoot, "GROUP.md"))).toBe(false);
    expect(readFileSync(join(stray, "GROUP.md"), "utf8")).toBe("not ours\n");
  });

  test("the retired product prompt files are removed", async () => {
    write(".houston/prompts/system.md", "old prompt");

    await migrateAgentStore({ workspacesRoot, agentRoot, log: noLog });

    expect(existsSync(join(agentRoot, ".houston/prompts/system.md"))).toBe(
      false,
    );
  });
});

test("every boot migration the host runs is in the pool's migrate op or named host-only", () => {
  const boot = readFileSync(
    join(__dirname, "..", "local", "host-migrations.ts"),
    "utf8",
  );
  const imported = [...boot.matchAll(/from "\.\.\/migrate\/([a-z-]+)"/g)].map(
    (match) => match[1],
  );
  const covered = new Set<string>([
    ...AGENT_STORE_MIGRATIONS,
    ...Object.keys(HOST_ONLY_MIGRATIONS),
  ]);
  expect(imported.length).toBeGreaterThan(0);
  expect(imported.filter((name) => !covered.has(name ?? ""))).toEqual([]);
});
