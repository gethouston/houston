import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { BrowserTab } from "./open-tab";
import { disposeSlot, newSlot, saveSlot } from "./pool-slot";
import { EMPTY_STATE } from "./state-merge";
import { browserStatePath, readState } from "./state-store";

const SIGNED_IN = {
  cookies: [
    {
      name: "sid",
      value: "kept",
      domain: "example.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

function openSlot() {
  const workspaceDir = mkdtempSync(join(tmpdir(), "pool-slot-"));
  mkdirSync(join(workspaceDir, ".houston"));
  const statePath = browserStatePath(workspaceDir);
  const storageState = vi.fn(async () => SIGNED_IN);
  const close = vi.fn(async () => undefined);
  const tab = {
    context: {
      browser: () => ({ isConnected: () => true }),
      storageState,
      close,
    },
    statePath,
    base: EMPTY_STATE,
  } as unknown as BrowserTab;
  const slot = newSlot(statePath);
  slot.tab = Promise.resolve(tab);
  return { slot, statePath, storageState, close };
}

test("saving a slot writes its sign-ins and keeps the context open", async () => {
  const { slot, statePath, close } = openSlot();
  expect(await saveSlot(slot)).toBe(true);
  expect(await readState(statePath)).toEqual(SIGNED_IN);
  expect(close).not.toHaveBeenCalled();
  expect(slot.tab).not.toBeNull();
});

test("closing a slot without saving never reads its storage", async () => {
  const { slot, statePath, storageState, close } = openSlot();
  expect(await disposeSlot(slot, false)).toBe(true);
  expect(storageState).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(existsSync(statePath)).toBe(false);
  expect(slot.tab).toBeNull();
});

test("closing a slot saves first by default", async () => {
  const { slot, statePath, close } = openSlot();
  expect(await disposeSlot(slot)).toBe(true);
  expect(await readState(statePath)).toEqual(SIGNED_IN);
  expect(close).toHaveBeenCalledOnce();
});

test("a slot that never opened has nothing to save", async () => {
  expect(await saveSlot(newSlot("/nowhere/.houston/browser/state.json"))).toBe(
    true,
  );
});
