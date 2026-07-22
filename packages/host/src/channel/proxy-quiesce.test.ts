import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { ProxyChannel } from "./proxy";

/**
 * quiesce — the rename precondition. Idempotence regression: quiescing an
 * agent whose runtime is ABSENT (never woken, or already torn down) must be a
 * no-op success, NOT a launcher sleep. The launcher's sleep contract rejects
 * sleeping an unknown sandbox (FakeLauncher throws "cannot sleep sandbox for
 * unknown agent"), and the dual-profile suite proved a blind sleep turns a
 * plain rename into a 500 on the cloud profile while local answered 200.
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
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
}

test("quiesce of an absent runtime is a no-op success (never calls sleep)", async () => {
  const calls: string[] = [];
  await expect(
    channelWith("absent", calls).quiesce(ctx),
  ).resolves.toBeUndefined();
  expect(calls).toEqual(["status"]);
});

test("quiesce sleeps a running runtime", async () => {
  const calls: string[] = [];
  await channelWith("running", calls).quiesce(ctx);
  expect(calls).toEqual(["status", "sleep:agent-1"]);
});

test("quiesce sleeps an asleep runtime too (sleep is idempotent for existing sandboxes)", async () => {
  const calls: string[] = [];
  await channelWith("asleep", calls).quiesce(ctx);
  expect(calls).toEqual(["status", "sleep:agent-1"]);
});
