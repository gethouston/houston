import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

/**
 * A conversation keeps its mode on its mission card (HOU-205). The turn route
 * is the one door every channel's message enters through, so it is where a
 * send that names no mode (a WhatsApp relay, an API follow-up, a client that
 * omits it) picks up the kept one instead of silently falling to Ask first.
 */

const chat = vi.hoisted(() => ({
  runTurn: vi.fn(async () => {}),
  ensureProviderForTurn: vi.fn(async () => "openai" as string | null),
}));
vi.mock("../session/chat", () => ({
  cancelTurn: vi.fn(),
  disposeConversation: vi.fn(),
  ensureProviderForTurn: chat.ensureProviderForTurn,
  runTurn: chat.runTurn,
  setLiveTurnMode: vi.fn(),
}));

const root = mkdtempSync(join(tmpdir(), "conversation-mode-route-"));
const workspaceDir = join(root, "agent");
vi.stubEnv("HOUSTON_DATA_DIR", join(root, "data"));
vi.stubEnv("HOUSTON_WORKSPACE_DIR", workspaceDir);
const { handleConversationRoute } = await import("./conversation-routes");
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function writeBoard(cards: unknown): void {
  const dir = join(workspaceDir, ".houston", "activity");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "activity.json"), JSON.stringify(cards));
}

async function post(body: unknown) {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as IncomingMessage;
  req.headers = {};
  const out: { status?: number } = {};
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: () => {},
  } as unknown as ServerResponse;
  await handleConversationRoute({
    method: "POST",
    path: "/conversations/activity-m1/messages",
    url: new URL("http://runtime.test/conversations/activity-m1/messages"),
    req,
    res,
  });
  return out;
}

/** The mode the accepted turn was pinned to. */
function turnMode(): unknown {
  const call = chat.runTurn.mock.calls[0] as unknown[] | undefined;
  return (call?.[3] as { mode?: unknown } | undefined)?.mode;
}

const missionCard = (mode?: string) => ({
  id: "m1",
  title: "Weekly report",
  description: "",
  status: "done",
  ...(mode ? { mode } : {}),
});

beforeEach(() => {
  chat.runTurn.mockClear();
  rmSync(join(workspaceDir, ".houston"), { recursive: true, force: true });
});

test("a send that names no mode runs on the mode its card keeps", async () => {
  writeBoard([missionCard("auto")]);
  expect((await post({ text: "next step" })).status).toBe(202);
  expect(turnMode()).toBe("auto");
});

test("a send's own mode still wins over the kept one", async () => {
  writeBoard([missionCard("auto")]);
  await post({ text: "just this once", mode: "plan" });
  expect(turnMode()).toBe("plan");
});

test("no card, a card with no mode, or an unreadable board runs Ask first", async () => {
  await post({ text: "hello" });
  expect(turnMode()).toBeUndefined();

  chat.runTurn.mockClear();
  writeBoard([missionCard()]);
  await post({ text: "hello" });
  expect(turnMode()).toBeUndefined();

  chat.runTurn.mockClear();
  const dir = join(workspaceDir, ".houston", "activity");
  writeFileSync(join(dir, "activity.json"), "{ half-written");
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await post({ text: "hello" })).status).toBe(202);
  expect(turnMode()).toBeUndefined();
  logged.mockRestore();
});
