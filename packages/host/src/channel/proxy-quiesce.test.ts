import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { ProxyChannel } from "./proxy";

/**
 * withQuiesced — the rename precondition. Idempotence regression: quiescing an
 * agent whose runtime is ABSENT (never woken, or already torn down) must be a
 * no-op success, NOT a launcher sleep. The launcher's sleep contract rejects
 * sleeping an unknown sandbox (FakeLauncher throws "cannot sleep sandbox for
 * unknown agent"), and the dual-profile suite proved a blind sleep turns a
 * plain rename into a 500 on the cloud profile while local answered 200.
 *
 * HOU-827 regression: the hold latch must span the sleep AND the callback —
 * the app's reconnect storm dispatches with the old id within ~500ms of the
 * runtime dying, and an unlatched window let ensureAwake boot a fresh runtime
 * into the directory being renamed. And it must be RELEASED afterward, even
 * when the callback throws, or the agent is bricked.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "gke",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 1,
};
const ctx = { workspace: ws, agent };

function channelWith(state: "running" | "asleep" | "absent", calls: string[]) {
  return new ProxyChannel({
    launcher: {
      async ensureAwake() {
        calls.push("ensureAwake");
        return { baseUrl: "http://runtime.local", token: "sbx-token" };
      },
      async sleep(agentId: string) {
        if (state === "absent")
          throw new Error(`cannot sleep sandbox for unknown agent ${agentId}`);
        calls.push(`sleep:${agentId}`);
      },
      async destroy() {},
      async status() {
        calls.push("status");
        return state;
      },
      hold(agentId: string) {
        calls.push(`hold:${agentId}`);
        return () => calls.push(`release:${agentId}`);
      },
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
}

test("withQuiesced on an absent runtime never sleeps, still runs fn under the hold", async () => {
  const calls: string[] = [];
  await expect(
    channelWith("absent", calls).withQuiesced(ctx, async () => {
      calls.push("fn");
      return "renamed";
    }),
  ).resolves.toBe("renamed");
  expect(calls).toEqual(["hold:agent-1", "status", "fn", "release:agent-1"]);
});

test("withQuiesced sleeps a running runtime before fn, releases after", async () => {
  const calls: string[] = [];
  await channelWith("running", calls).withQuiesced(ctx, async () => {
    calls.push("fn");
  });
  expect(calls).toEqual([
    "hold:agent-1",
    "status",
    "sleep:agent-1",
    "fn",
    "release:agent-1",
  ]);
});

test("withQuiesced sleeps an asleep runtime too (sleep is idempotent for existing sandboxes)", async () => {
  const calls: string[] = [];
  await channelWith("asleep", calls).withQuiesced(ctx, async () => {
    calls.push("fn");
  });
  expect(calls).toEqual([
    "hold:agent-1",
    "status",
    "sleep:agent-1",
    "fn",
    "release:agent-1",
  ]);
});

test("a throwing fn still releases the hold (the agent is not bricked)", async () => {
  const calls: string[] = [];
  await expect(
    channelWith("running", calls).withQuiesced(ctx, async () => {
      throw new Error("name already taken");
    }),
  ).rejects.toThrow("name already taken");
  expect(calls).toEqual([
    "hold:agent-1",
    "status",
    "sleep:agent-1",
    "release:agent-1",
  ]);
});

test("a failing sleep surfaces AND releases the hold (fn never runs)", async () => {
  const calls: string[] = [];
  const channel = new ProxyChannel({
    launcher: {
      async ensureAwake() {
        return { baseUrl: "http://runtime.local", token: "sbx-token" };
      },
      async sleep() {
        throw new Error("runtime is still alive after SIGTERM and SIGKILL");
      },
      async destroy() {},
      async status() {
        return "running" as const;
      },
      hold(agentId: string) {
        calls.push(`hold:${agentId}`);
        return () => calls.push(`release:${agentId}`);
      },
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  await expect(
    channel.withQuiesced(ctx, async () => {
      calls.push("fn");
    }),
  ).rejects.toThrow("still alive");
  expect(calls).toEqual(["hold:agent-1", "release:agent-1"]);
});
