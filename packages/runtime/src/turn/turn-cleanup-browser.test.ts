import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  browserAvailable,
  fixturePool,
  handoffTool,
} from "../session/tools/browser/browser.test-support";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import { sharedBrowserPool } from "../session/tools/browser/pool";
import { browserStatePath } from "../session/tools/browser/state-store";
import { cleanupTurn } from "./turn-cleanup";

const available = await browserAvailable();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function turnRoot() {
  const root = mkdtempSync(join(tmpdir(), "turn-browser-"));
  const workspaceDir = join(root, "workspace", "Agent");
  mkdirSync(join(workspaceDir, ".houston"), { recursive: true });
  return { root, workspaceDir };
}

afterAll(() => sharedBrowserPool.shutdown());

test("the turn's browser closes before its root is removed", async () => {
  const calls: string[] = [];
  await cleanupTurn({
    root: "/tmp/turn-x",
    scope: "w/a",
    conversationId: "c1",
    heartbeat: null,
    sandbox: null,
    closeBrowser: async (root, conversationId) => {
      calls.push(`browser ${root} ${conversationId}`);
    },
    removeRoot: async (root) => {
      calls.push(`remove ${root}`);
    },
  });
  expect(calls).toEqual(["browser /tmp/turn-x c1", "remove /tmp/turn-x"]);
});

describe.skipIf(!available)(
  "a pooled turn's browser against a real Chromium",
  { timeout: 30_000 },
  () => {
    test("closing a turn's workspace saves and forgets its context; the idle sweep never recreates it", async () => {
      const pool = fixturePool({ idleMs: 100 });
      const { root, workspaceDir } = turnRoot();
      const statePath = browserStatePath(workspaceDir);
      const tab = await pool.run("k", statePath, async (t) => t);
      await pool.closeUnder(root);
      expect(tab.context.pages()).toHaveLength(0);
      expect(existsSync(statePath)).toBe(true);
      rmSync(root, { recursive: true, force: true });
      await sleep(400);
      expect(existsSync(root)).toBe(false);
      await pool.shutdown();
      expect(existsSync(root)).toBe(false);
    });

    test("cleanup ends a waiting hand-off and saves sign-ins before the root goes", async () => {
      const { root, workspaceDir } = turnRoot();
      const chat = "turn-cleanup-chat";
      const run = handoffTool(workspaceDir, sharedBrowserPool, sharedHandoffs, {
        chat,
      });
      const pending = run({ action: "handoff", text: "Sign in" });
      for (let i = 0; i < 200 && !sharedHandoffs.get(chat); i += 1)
        await sleep(25);
      let savedAtRemoval = false;
      await cleanupTurn({
        root,
        scope: "w/a",
        conversationId: chat,
        heartbeat: null,
        sandbox: null,
        removeRoot: async (dir) => {
          savedAtRemoval = existsSync(browserStatePath(workspaceDir));
          rmSync(dir, { recursive: true, force: true });
        },
      });
      expect(savedAtRemoval).toBe(true);
      expect((await pending).details).toMatchObject({
        ok: false,
        error: { code: "handoff_cancelled" },
      });
      expect(existsSync(root)).toBe(false);
    });
  },
);
