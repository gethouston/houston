import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { withinDeadline } from "./action-deadline";
import type { BackupBrowser } from "./kernel-tab";
import type { BrowserTab } from "./open-tab";
import { newSlot, type Slot } from "./pool-slot";
import { SlotAbandoned, slotSwap } from "./tab-swap";

function fakeTab(host?: string) {
  const dispose = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const tab = {
    context: { close },
    ...(host ? { backup: { host, dispose } } : {}),
  } as unknown as BrowserTab;
  return { tab, dispose, close };
}

function fakeBackup() {
  const opened: ReturnType<typeof fakeTab>[] = [];
  const backup: BackupBrowser = {
    open: vi.fn(async (_path: string, _max: number, host: string) => {
      const made = fakeTab(host);
      opened.push(made);
      return made.tab;
    }),
  };
  return { backup, opened };
}

const openLocal = vi.fn(async () => fakeTab().tab);

async function abandoned(slot: Slot, stuck: Promise<unknown>): Promise<void> {
  await expect(withinDeadline(slot, stuck, 5)).rejects.toMatchObject({
    code: "page_unresponsive",
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

test("an abandoned call opens no backup: it would bill under the next call", async () => {
  const slot = newSlot("/ws/state.json");
  const { backup } = fakeBackup();
  const swap = slotSwap(slot, backup, openLocal, 3);
  await abandoned(slot, new Promise(() => undefined));
  expect(() => swap.openBackup?.("shop.example")).toThrow(SlotAbandoned);
  expect(backup.open).not.toHaveBeenCalled();
});

test("an abandoned call never adopts its backup over the next call's tab", async () => {
  const slot = newSlot("/ws/state.json");
  const { backup, opened } = fakeBackup();
  const swap = slotSwap(slot, backup, openLocal, 3);
  const mine = await swap.openBackup?.("shop.example");
  await abandoned(slot, new Promise(() => undefined));
  const next = fakeTab();
  slot.tab = Promise.resolve(next.tab);
  await expect(swap.adopt(mine as BrowserTab)).rejects.toThrow(SlotAbandoned);
  expect(await slot.tab).toBe(next.tab);
  expect(next.close).not.toHaveBeenCalled();
  await swap.dropBackup();
  expect(opened[0]?.dispose).toHaveBeenCalled();
});

test("dropping a backup ends this call's own session, never the next call's", async () => {
  const slot = newSlot("/ws/state.json");
  const { backup, opened } = fakeBackup();
  const first = slotSwap(slot, backup, openLocal, 3);
  await first.openBackup?.("shop.example");
  await abandoned(slot, new Promise(() => undefined));
  const second = slotSwap(slot, backup, openLocal, 3);
  const theirs = second.openBackup?.("shop.example");
  await first.dropBackup();
  expect(opened[1]?.dispose).not.toHaveBeenCalled();
  expect(slot.spare).toBe(theirs);
  await second.dropBackup();
  expect(opened[1]?.dispose).toHaveBeenCalledOnce();
  expect(slot.spare).toBeNull();
});

test("an abandoned call does not reopen the slot's tab under the next call", async () => {
  const slot = newSlot("/ws/state.json");
  const swap = slotSwap(slot, null, openLocal, 3);
  await abandoned(slot, new Promise(() => undefined));
  const next = fakeTab();
  slot.tab = Promise.resolve(next.tab);
  await expect(swap.reopenLocal()).rejects.toThrow(SlotAbandoned);
  expect(await slot.tab).toBe(next.tab);
  expect(next.close).not.toHaveBeenCalled();
});

test("a live call adopts its backup and closes the tab it replaces", async () => {
  const slot = newSlot("/ws/state.json");
  const local = fakeTab();
  slot.tab = Promise.resolve(local.tab);
  const { backup } = fakeBackup();
  const swap = slotSwap(slot, backup, openLocal, 3);
  const mine = (await swap.openBackup?.("shop.example")) as BrowserTab;
  await swap.adopt(mine);
  expect(await slot.tab).toBe(mine);
  expect(slot.spare).toBeNull();
  expect(local.close).toHaveBeenCalledOnce();
});
