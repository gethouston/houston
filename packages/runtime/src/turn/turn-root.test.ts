import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { buildSystemPrompt } from "../backends/claude/system-prompt";
import { cleanupTurn } from "./turn-cleanup";
import {
  conversationTurnRoot,
  createTurnRoot,
  TURN_ROOT_PREFIX,
  type TurnRootIdentity,
} from "./turn-root";

afterEach(() => {
  vi.restoreAllMocks();
});

const conversation = (conversationId = "c1"): TurnRootIdentity => ({
  workspaceId: "w1",
  agentId: "agent-1",
  conversationId,
});

const freshBase = () => mkdtempSync(join(tmpdir(), "turn-root-test-"));

test("every turn of a conversation gets the same root; other conversations never share it", () => {
  const base = freshBase();
  const root = conversationTurnRoot(conversation(), base);
  expect(conversationTurnRoot(conversation(), base)).toBe(root);
  expect(dirname(root)).toBe(base);
  expect(root.slice(base.length + 1).startsWith(TURN_ROOT_PREFIX)).toBe(true);
  expect(conversationTurnRoot(conversation("c2"), base)).not.toBe(root);
  expect(
    conversationTurnRoot({ ...conversation(), agentId: "agent-2" }, base),
  ).not.toBe(root);
  expect(
    conversationTurnRoot({ ...conversation(), workspaceId: "w2" }, base),
  ).not.toBe(root);
});

test("a free conversation root is created private to its owner", async () => {
  const base = freshBase();
  const root = await createTurnRoot(conversation(), base);
  expect(root).toBe(conversationTurnRoot(conversation(), base));
  expect(statSync(root).mode & 0o777).toBe(0o700);
});

test("a runtime without a tool shell keeps the root private", async () => {
  const root = await createTurnRoot(conversation(), freshBase(), false);
  expect(statSync(root).mode & 0o777).toBe(0o700);
});

test("with a tool shell the root is sticky and open to its group, whatever the umask", async () => {
  const root = await createTurnRoot(conversation(), freshBase(), true);
  expect(statSync(root).mode & 0o7777).toBe(0o1770);
});

test.skipIf(process.platform !== "linux")(
  "a shared root keeps the setgid bit its parent handed down",
  async () => {
    const base = freshBase();
    chmodSync(base, 0o2770);
    const root = await createTurnRoot(conversation(), base, true);
    expect(statSync(root).mode & 0o7777).toBe(0o3770);
  },
);

test("a shared fallback root is open to its group too", async () => {
  const base = freshBase();
  mkdirSync(conversationTurnRoot(conversation(), base));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const root = await createTurnRoot(conversation(), base, true);
  expect(root).not.toBe(conversationTurnRoot(conversation(), base));
  expect(statSync(root).mode & 0o7777).toBe(0o1770);
});

test("an existing conversation root is never reused: the turn falls back to a fresh root and says why", async () => {
  const base = freshBase();
  const stable = conversationTurnRoot(conversation(), base);
  mkdirSync(stable);
  writeFileSync(join(stable, "leftover.txt"), "previous turn");
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

  const root = await createTurnRoot(conversation(), base);

  expect(root).not.toBe(stable);
  expect(dirname(root)).toBe(base);
  expect(root.slice(base.length + 1).startsWith(TURN_ROOT_PREFIX)).toBe(true);
  expect(existsSync(join(root, "leftover.txt"))).toBe(false);
  expect(readFileSync(join(stable, "leftover.txt"), "utf8")).toBe(
    "previous turn",
  );
  expect(info).toHaveBeenCalledTimes(1);
  expect(String(info.mock.calls[0]?.[0])).toContain(stable);
  expect(String(info.mock.calls[0]?.[0])).toContain(root);
});

function writeSkill(workspaceDir: string, slug: string, description: string) {
  const dir = join(workspaceDir, ".agents", "skills", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}\n---\n\nDo it.\n`,
  );
}

async function promptOfOneTurn(
  id: TurnRootIdentity,
  base: string,
): Promise<{ prompt: string; root: string }> {
  const root = await createTurnRoot(id, base);
  const workspaceDir = join(root, "store", "workspaces", "W", "A");
  mkdirSync(join(workspaceDir, ".houston"), { recursive: true });
  writeFileSync(join(workspaceDir, "CLAUDE.md"), "You run the sales desk.");
  writeFileSync(join(workspaceDir, "WORKSPACE.md"), "Acme Corp.");
  writeSkill(workspaceDir, "weekly-report", "Weekly sales report");
  writeSkill(workspaceDir, "lead-intake", "Qualify a new lead");
  const prompt = buildSystemPrompt(workspaceDir, "You are Houston.");
  await cleanupTurn({
    root,
    scope: `${id.workspaceId}/${id.agentId}`,
    conversationId: id.conversationId,
    heartbeat: null,
    sandbox: null,
  });
  return { prompt, root };
}

test("the Claude system prompt is byte-identical across two turns of one conversation", async () => {
  const base = freshBase();
  const first = await promptOfOneTurn(conversation(), base);
  const second = await promptOfOneTurn(conversation(), base);

  expect(first.prompt).toContain(join(first.root, "store"));
  expect(first.prompt).toContain("WORKSPACE.md");
  expect(first.prompt).toContain("<available_skills>");
  expect(second.prompt).toBe(first.prompt);
  expect(existsSync(first.root)).toBe(false);
  expect(existsSync(second.root)).toBe(false);

  const other = await promptOfOneTurn(conversation("c2"), base);
  expect(other.prompt).not.toBe(first.prompt);
});
