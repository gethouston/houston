import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ASSISTANT_AGENT_NAME } from "@houston/host/src/routes/assistant";
import { expect, test } from "vitest";
import {
  buildLearningsSection,
  isAssistantWorkspace,
  learningsDocPath,
  loadAgentLearnings,
} from "./learnings-context";

/**
 * The assistant's memory is the ONE learnings surface injected into every system
 * prompt. Two invariants: only the `.assistant` agent gets it (the basename is
 * the whole signal — a runtime knows nothing else about which agent it is), and
 * an unreadable doc never costs the agent its session.
 */

function agentDir(name: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "houston-learnctx-")), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeLearnings(cwd: string, raw: string): void {
  const path = learningsDocPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, raw);
}

function seed(cwd: string, texts: string[]): void {
  writeLearnings(
    cwd,
    JSON.stringify(
      texts.map((text, i) => ({
        id: `l${i}`,
        text,
        created_at: "2026-01-01T00:00:00.000Z",
      })),
    ),
  );
}

test("learningsDocPath points at the agent's .houston learnings doc", () => {
  expect(learningsDocPath("/tmp/ws/.assistant")).toBe(
    join("/tmp/ws/.assistant", ".houston", "learnings", "learnings.json"),
  );
});

test("isAssistantWorkspace keys off the agent root's basename", () => {
  expect(isAssistantWorkspace(join("/tmp/ws", ASSISTANT_AGENT_NAME))).toBe(
    true,
  );
  expect(isAssistantWorkspace(join("/tmp/ws", "Helper"))).toBe(false);
  // A nested dir under the assistant is NOT the assistant's root.
  expect(
    isAssistantWorkspace(join("/tmp/ws", ASSISTANT_AGENT_NAME, "sub")),
  ).toBe(false);
});

test("the section renders one bullet per learning for the assistant", () => {
  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  seed(cwd, ["Julian prefers short replies.", "Invoices go out on the 1st."]);

  const out = buildLearningsSection(cwd);
  expect(out).not.toBeNull();
  expect(out).toContain("# What you remember about this user");
  expect(out).toContain("- Julian prefers short replies.");
  expect(out).toContain("- Invoices go out on the 1st.");
});

test("the section states memories only land from the next chat onwards", () => {
  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  seed(cwd, ["Julian prefers short replies."]);

  // The prompt is frozen at session build, so this sentence is a contract, not
  // decoration — without it the agent claims an in-chat memory it does not have.
  expect(buildLearningsSection(cwd)).toContain("from the next chat onwards");
});

test("the section never leaks plumbing vocabulary to the model", () => {
  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  seed(cwd, ["Julian prefers short replies."]);

  const out = buildLearningsSection(cwd) ?? "";
  for (const banned of ["JSON", ".houston", "file", "path"]) {
    expect(out).not.toContain(banned);
  }
});

test("a normally named agent gets NO section even with learnings", () => {
  const cwd = agentDir("Helper");
  seed(cwd, ["Julian prefers short replies."]);

  expect(buildLearningsSection(cwd)).toBeNull();
});

test("the assistant with no learnings doc gets no section", () => {
  expect(buildLearningsSection(agentDir(ASSISTANT_AGENT_NAME))).toBeNull();
});

test("a malformed learnings doc yields no section rather than throwing", () => {
  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  writeLearnings(cwd, "{not json");

  expect(buildLearningsSection(cwd)).toBeNull();
});

test("an empty array and blank texts yield no section", () => {
  const empty = agentDir(ASSISTANT_AGENT_NAME);
  writeLearnings(empty, "[]");
  expect(buildLearningsSection(empty)).toBeNull();

  const blank = agentDir(ASSISTANT_AGENT_NAME);
  seed(blank, ["   "]);
  expect(buildLearningsSection(blank)).toBeNull();
});

test("loadAgentLearnings drops malformed entries and keeps the good ones", () => {
  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  writeLearnings(
    cwd,
    JSON.stringify([
      { id: "ok", text: "kept", created_at: "2026-01-01T00:00:00.000Z" },
      { id: 7, text: "numeric id" },
      { id: "no-text" },
      { text: "no id" },
      "a bare string",
      null,
    ]),
  );

  expect(loadAgentLearnings(cwd).map((l) => l.id)).toEqual(["ok"]);
});

test("loadAgentLearnings returns [] for a missing doc and for a non-array doc", () => {
  expect(loadAgentLearnings(agentDir(ASSISTANT_AGENT_NAME))).toEqual([]);

  const cwd = agentDir(ASSISTANT_AGENT_NAME);
  writeLearnings(cwd, JSON.stringify({ items: [] }));
  expect(loadAgentLearnings(cwd)).toEqual([]);
});
