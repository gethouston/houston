import type { HoustonEvent, SidebarLayout, Workspace } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { auth, deps, startAccountServer } from "../../tests/account-fixture";
import type { EventHub } from "../events/hub";
import { createControlPlaneServer } from "../server";

let base = "";
let close: () => Promise<void>;
beforeAll(async () => {
  ({ base, close } = await startAccountServer());
});
afterAll(async () => close());

async function wsIdOf(who: string): Promise<string> {
  const list = (await (
    await fetch(`${base}/v1/workspaces`, { headers: auth(who) })
  ).json()) as Workspace[];
  const id = list[0]?.id;
  if (!id) throw new Error(`expected ${who} to have a workspace`);
  return id;
}

const LAYOUT: SidebarLayout = {
  groups: [{ id: "g1", name: "Work", collapsed: false, agentIds: ["a1"] }],
  order: [],
};

test("PUT sidebar-layout emits SidebarLayoutChanged to the owner", async () => {
  const emitted: { userId: string; event: HoustonEvent }[] = [];
  const events: EventHub = {
    emit: (userId, event) => emitted.push({ userId, event }),
    subscribe: () => () => {},
  };
  const srv = createControlPlaneServer(deps({ events }));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const addr = srv.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const list = (await (
      await fetch(`${b}/v1/workspaces`, { headers: auth("grace") })
    ).json()) as Workspace[];
    const id = list[0]?.id;
    if (!id) throw new Error("expected grace to have a workspace");
    const put = await fetch(`${b}/v1/workspaces/${id}/sidebar-layout`, {
      method: "PUT",
      headers: auth("grace"),
      body: JSON.stringify(LAYOUT),
    });
    expect(put.status).toBe(200);
    await put.json();
    expect(emitted).toEqual([
      {
        userId: "grace",
        event: { type: "SidebarLayoutChanged", workspaceId: id },
      },
    ]);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test("sidebar-layout is walled off from a non-owner (403)", async () => {
  const id = await wsIdOf("heidi");
  const byBob = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("bob"),
    body: JSON.stringify(LAYOUT),
  });
  expect(byBob.status).toBe(403);
  await byBob.text();
});

test("sidebar-layout routes 503 without a vfs", async () => {
  const id = await wsIdOf("ivan");
  const noVfs = createControlPlaneServer(deps({ vfs: undefined }));
  await new Promise<void>((r) => noVfs.listen(0, "127.0.0.1", () => r()));
  const addr = noVfs.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/v1/workspaces/${id}/sidebar-layout`, {
      headers: auth("ivan"),
    });
    expect(r.status).toBe(503);
    await r.text();
  } finally {
    await new Promise<void>((r) => noVfs.close(() => r()));
  }
});
