import { expect, test } from "vitest";
import { importScope } from "./op-scope";
import { importListed, opClaimId, opTreeOptions } from "./op-tree-options";

const RUNTIME = "workspaces/Personal/Bob/.houston/runtime";

test("an import lists the runtime transcripts and sessions, nothing else of the runtime tree", () => {
  for (const rel of [
    `${RUNTIME}/conversations/c1.json`,
    `${RUNTIME}/conversations/c1.archive/1.json`,
    `${RUNTIME}/sessions/c1/s.jsonl`,
    "workspaces/Personal/Bob/CLAUDE.md",
    "workspaces/Personal/Bob/files/.houston/runtime/mine.txt",
    "custom-integrations.json",
  ])
    expect(importListed(rel), rel).toBe(true);
  for (const rel of [
    `${RUNTIME}/settings.json`,
    `${RUNTIME}/runtime.log`,
    `${RUNTIME}/models-store/x.json`,
    `${RUNTIME}/conversations`,
  ])
    expect(importListed(rel), rel).toBe(false);
});

test("an import writes the agent tree, transcripts with their segments, and sessions", () => {
  const include = importScope("workspaces/Personal/Bob", RUNTIME);
  for (const rel of [
    "workspaces/Personal/Bob/notes.md",
    `${RUNTIME}/conversations/c1.json`,
    `${RUNTIME}/conversations/c1.archive/2.json`,
    `${RUNTIME}/sessions/c1/2026.jsonl`,
  ])
    expect(include(rel), rel).toBe(true);
  for (const rel of [
    `${RUNTIME}/settings.json`,
    `${RUNTIME}/auth.json`,
    `${RUNTIME}/conversations/c1.txt`,
    `${RUNTIME}/conversations/c1.archive/deep/2.json`,
    "workspaces/Personal/Ann/notes.md",
  ])
    expect(include(rel), rel).toBe(false);
});

test("only a migration import takes the agent-import claim", () => {
  const route = (rest: string) =>
    ({ kind: "route", method: "POST", rest }) as const;
  expect(opClaimId(route("migration/import"))).toBe("agent-import");
  expect(opClaimId(route("migration%2Fimport"))).toBe("agent-import");
  expect(opClaimId(route("migration/complete"))).toBe("agent-ops");
  expect(opClaimId(route("routines"))).toBe("agent-ops");
  expect(
    opClaimId({ kind: "conversation", action: "delete", conversationId: "c1" }),
  ).toBe("c1");
  expect(opTreeOptions(route("routines")).excludes).toEqual([
    "workspaces/*/*/.houston/runtime/",
  ]);
  expect(opTreeOptions(route("migration/import")).excludes).toBeUndefined();
});

test("settings and credential ops download exactly the runtime files their handlers touch", () => {
  const settings = {
    kind: "settings",
    action: "put",
    input: { activeProvider: "anthropic" },
  } as const;
  const credential = {
    kind: "credential",
    action: "api-key",
    provider: "openrouter",
    apiKey: "k",
  } as const;
  for (const op of [settings, credential]) {
    const { filter, lazy } = opTreeOptions(op);
    expect(lazy, op.kind).toBeUndefined();
    expect(filter, op.kind).toBeDefined();
    const admits = (rel: string) => filter?.(rel) === true;
    for (const dataRel of [RUNTIME, "data"])
      for (const file of [
        "settings.json",
        "custom-endpoint.json",
        "qwen-region.json",
        "azure-endpoint.json",
        "xiaomi-endpoint.json",
      ])
        expect(admits(`${dataRel}/${file}`), `${op.kind} ${file}`).toBe(true);
    for (const rel of [
      "workspaces/Personal/Bob/render/big.bin",
      "workspaces/Personal/Bob/data/export/report.csv",
      "workspaces/Personal/Bob/uploads/a.png",
      "workspaces/Personal/Bob/CLAUDE.md",
      "workspaces/Personal/Bob/huge-root-file.bin",
      "workspaces/Personal/Bob/.git/objects/pack/p.pack",
      "workspaces/Personal/Bob/.venv/lib/x.py",
      "workspaces/Personal/Bob/.agents/skills/x/SKILL.md",
      "workspaces/Personal/Bob/.houston/activity/activity.json",
      `${RUNTIME}/runtime.log`,
      `${RUNTIME}/auth.json`,
      `${RUNTIME}/claude-login/state.json`,
      `${RUNTIME}/models-store/x.json`,
      "workspaces/Personal/Bob/files/.houston/runtime/settings.json",
      "data/runtime.log",
      "data/nested/settings.json",
      "custom-integrations.json",
      "settings.json",
    ])
      expect(admits(rel), `${op.kind} ${rel}`).toBe(false);
  }
  expect(
    opTreeOptions({ kind: "route", method: "POST", rest: "routines" }).filter,
  ).toBeUndefined();
  expect(
    opTreeOptions({
      kind: "conversation",
      action: "delete",
      conversationId: "c1",
    }).filter,
  ).toBeUndefined();
});
