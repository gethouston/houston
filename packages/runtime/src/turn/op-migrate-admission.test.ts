import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_STORE_MIGRATION_VERSION } from "@houston/host/src/migrate/agent-store";
import { expect, test } from "vitest";
import type { MigrateOp } from "./op-grammar-migrate";
import { executeMigrateOp } from "./op-migrate";
import { migrateHydrateFilter } from "./op-migrate-tree";
import {
  docRoute,
  generationStore,
  PREFIX,
  seedRequest,
} from "./op-seed.test-support";
import type { OpRequest } from "./parse-op-request";

const AGENT = "workspaces/Personal/Ledger";

async function run(
  fake: ReturnType<typeof generationStore>,
  maxHydrateBytes?: number,
) {
  const seed = seedRequest({ name: "Ledger" });
  const request: OpRequest & { op: MigrateOp } = {
    ...seed,
    op: { kind: "migrate", version: AGENT_STORE_MIGRATION_VERSION },
  };
  const reply = await executeMigrateOp({
    deps: {
      ...docRoute().deps,
      ...(maxHydrateBytes !== undefined ? { maxHydrateBytes } : {}),
    },
    op: request,
    turn: { ...request, conversationId: "agent-ops" },
    store: fake.store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "op-migrate-admission-")),
    fenced: async () => false,
  });
  const relayed = reply.body as { status?: number; body?: string };
  return {
    status: relayed.status,
    answer: relayed.body
      ? (JSON.parse(relayed.body) as Record<string, unknown>)
      : {},
  };
}

test("the filter admits what the migrations read and nothing an agent keeps beside it", () => {
  const admitted = [
    "custom-integration-secrets.json",
    "workspaces/ws/preferences.json",
    `${AGENT}/CLAUDE.md`,
    `${AGENT}/GROUP.md`,
    `${AGENT}/.houston/routines.json`,
    `${AGENT}/.houston/routines/routines.json`,
    `${AGENT}/.houston/learnings/learnings.schema.json`,
    `${AGENT}/.houston/memory/learnings.md`,
    `${AGENT}/.houston/prompts/system.md`,
  ];
  const refused = [
    `${AGENT}/.houston/backups/esteban/2026-09-29/snapshot.tgz`,
    `${AGENT}/.houston/runtime/sessions/s1.jsonl`,
    `${AGENT}/.houston/sessions/claude/a.json`,
    `${AGENT}/.houston/routines/notes.md`,
    `${AGENT}/.venv/lib/site.py`,
    `${AGENT}/report.pdf`,
    `${AGENT}/sub/CLAUDE.md`,
  ];
  expect(admitted.filter((rel) => !migrateHydrateFilter(rel))).toEqual([]);
  expect(refused.filter(migrateHydrateFilter)).toEqual([]);
});

test("an agent whose backups alone pass the cap migrates without reading them", async () => {
  const fake = generationStore();
  fake.put(`${AGENT}/CLAUDE.md`, "# Ledger\n");
  fake.put(`${AGENT}/.houston/routines.json`, "[]");
  const tarball = `${AGENT}/.houston/backups/esteban/2026-09-29/snapshot.tgz`;
  fake.put(tarball, "x".repeat(8192));
  fake.put(`${AGENT}/.venv/lib/site.py`, "x".repeat(8192));

  const { status, answer } = await run(fake, 4096);

  expect(status).toBe(200);
  expect(answer.version).toBe(AGENT_STORE_MIGRATION_VERSION);
  expect(answer.layoutFiles).toBe(1);
  expect(fake.downloads).not.toContain(tarball);
  expect(fake.downloads.filter((rel) => !migrateHydrateFilter(rel))).toEqual(
    [],
  );
  expect(fake.read(tarball)).toBe("x".repeat(8192));
});

test("a prefix that lists nothing is refused as store_empty", async () => {
  const fake = generationStore();

  const { status, answer } = await run(fake);

  expect(status).toBe(500);
  expect(answer.code).toBe("store_empty");
  expect(fake.uploads).toEqual([]);
});

test("two agent trees under one prefix still answer layout_unexpected", async () => {
  const fake = generationStore();
  fake.put(`${AGENT}/CLAUDE.md`, "# Ledger\n");
  fake.put("workspaces/Personal/Old/CLAUDE.md", "# Old\n");

  const { answer } = await run(fake);

  expect(answer.code).toBe("layout_unexpected");
});
