import { afterEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { ProxyChannel } from "./proxy";

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

afterEach(() => {
  vi.restoreAllMocks();
});

test("busy answers false for an asleep runtime without waking it", async () => {
  const calls: string[] = [];
  const channel = new ProxyChannel({
    launcher: {
      async ensureAwake() {
        calls.push("ensureAwake");
        throw new Error("must not wake an asleep runtime for busy");
      },
      async sleep() {},
      async destroy() {},
      async status() {
        calls.push("status");
        return "asleep" as const;
      },
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });

  await expect(channel.busy(ctx)).resolves.toBe(false);
  expect(calls).toEqual(["status"]);
});

test("busy proxies to a running runtime's /busy endpoint", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ busy: true }));
  const channel = new ProxyChannel({
    launcher: {
      async ensureAwake() {
        return { baseUrl: "http://runtime.local", token: "sbx-token" };
      },
      async sleep() {},
      async destroy() {},
      async status() {
        return "running" as const;
      },
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });

  await expect(channel.busy(ctx)).resolves.toBe(true);
  expect(fetchSpy).toHaveBeenCalledWith("http://runtime.local/busy", {
    headers: { Authorization: "Bearer sbx-token" },
  });
});

test("busy treats an unreachable running runtime as busy", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unreachable"));
  const channel = new ProxyChannel({
    launcher: {
      async ensureAwake() {
        return { baseUrl: "http://runtime.local", token: "sbx-token" };
      },
      async sleep() {},
      async destroy() {},
      async status() {
        return "running" as const;
      },
    },
    proxy: { async forward() {} },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });

  await expect(channel.busy(ctx)).resolves.toBe(true);
});
