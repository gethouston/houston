import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "./credential-store";

function tmpStore(): HoustonAuthStore {
  return new HoustonAuthStore(
    join(mkdtempSync(join(tmpdir(), "houston-store-")), "auth.json"),
  );
}

const oauth = (access: string): Credential => ({
  type: "oauth",
  access,
  refresh: "rt",
  expires: Date.now() + 3_600_000,
});

test("modify persists the returned credential; undefined leaves the entry unchanged", async () => {
  const store = tmpStore();
  await store.modify("openrouter", async () => ({
    type: "api_key",
    key: "sk-1",
  }));
  expect(store.get("openrouter")).toEqual({ type: "api_key", key: "sk-1" });
  await store.modify("openrouter", async () => undefined);
  expect(store.get("openrouter")).toEqual({ type: "api_key", key: "sk-1" });
});

test("modify is serialized per provider — a slow refresh cannot interleave", async () => {
  const store = tmpStore();
  store.set("openai-codex", oauth("old"));
  const order: string[] = [];
  let releaseFirst!: () => void;
  const gate = new Promise<void>((r) => (releaseFirst = r));
  const first = store.modify("openai-codex", async () => {
    order.push("first-start");
    await gate;
    order.push("first-end");
    return oauth("refreshed-1");
  });
  const second = store.modify("openai-codex", async (current) => {
    order.push("second-start");
    expect((current as { access?: string })?.access).toBe("refreshed-1");
    return oauth("refreshed-2");
  });
  releaseFirst();
  await Promise.all([first, second]);
  expect(order).toEqual(["first-start", "first-end", "second-start"]);
  expect((store.get("openai-codex") as { access?: string })?.access).toBe(
    "refreshed-2",
  );
});

test("delete queued behind an in-flight refresh wins — sign-out is never resurrected", async () => {
  const store = tmpStore();
  store.set("openai-codex", oauth("old"));
  let releaseRefresh!: () => void;
  const network = new Promise<void>((r) => (releaseRefresh = r));
  const refresh = store.modify("openai-codex", async () => {
    await network;
    return oauth("rotated");
  });
  const signOut = store.delete("openai-codex");
  releaseRefresh();
  await Promise.all([refresh, signOut]);
  expect(store.get("openai-codex")).toBeUndefined();
});

test("a rejecting modify still propagates AND does not wedge the chain", async () => {
  const store = tmpStore();
  await expect(
    store.modify("deepseek", async () => {
      throw new Error("token endpoint 500");
    }),
  ).rejects.toThrow("token endpoint 500");
  await store.modify("deepseek", async () => ({ type: "api_key", key: "k2" }));
  expect(store.get("deepseek")).toEqual({ type: "api_key", key: "k2" });
});
