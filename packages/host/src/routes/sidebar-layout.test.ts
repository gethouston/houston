import type { SidebarLayout, Workspace } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { auth, startAccountServer } from "../../tests/account-fixture";
import { parseSidebarLayout, readSidebarLayout } from "./sidebar-layout";

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
  groups: [
    { id: "g1", name: "Work", collapsed: false, agentIds: ["a1", "a2"] },
  ],
  order: [
    { kind: "agent", id: "a3" },
    { kind: "group", id: "g1" },
  ],
};

test("GET sidebar-layout returns the default when unset", async () => {
  const id = await wsIdOf("dave");
  const r = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("dave"),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    groups: [],
    order: [],
  });
});

test("PUT sidebar-layout persists and GET round-trips it", async () => {
  const id = await wsIdOf("erin");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("erin"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(LAYOUT);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("erin"),
  });
  expect(await get.json()).toEqual(LAYOUT);
});

test("PUT sidebar-layout with an invalid body is a 400", async () => {
  const id = await wsIdOf("frank");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("frank"),
    body: JSON.stringify({
      groups: "not-an-array",
      order: [],
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("sidebar-layout ignores unknown fields on write and read", async () => {
  const id = await wsIdOf("judy");
  const extra = {
    ...LAYOUT,
    unsupported: true,
    groups: LAYOUT.groups.map((group) => ({ ...group, unsupported: "unused" })),
  };
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("judy"),
    body: JSON.stringify(extra),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(LAYOUT);
  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("judy"),
  });
  expect(await get.json()).toEqual(LAYOUT);
});

/** A folder's optional icon and color retain their validated string values. */
test("PUT sidebar-layout round-trips a group's icon and color", async () => {
  const id = await wsIdOf("mona");
  const styled: SidebarLayout = {
    ...LAYOUT,
    groups: LAYOUT.groups.map((g) => ({
      ...g,
      icon: "pen-tool",
      color: "#5E6AD2",
    })),
  };
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("mona"),
    body: JSON.stringify(styled),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(styled);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("mona"),
  });
  expect(await get.json()).toEqual(styled);
});

test("PUT sidebar-layout with a non-string group icon is a 400", async () => {
  const id = await wsIdOf("nina");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("nina"),
    body: JSON.stringify({
      ...LAYOUT,
      groups: LAYOUT.groups.map((g) => ({ ...g, icon: 7 })),
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("PUT sidebar-layout with a non-string group color is a 400", async () => {
  const id = await wsIdOf("omar");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("omar"),
    body: JSON.stringify({
      ...LAYOUT,
      groups: LAYOUT.groups.map((g) => ({ ...g, color: false })),
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("sidebar-layout leaves an absent icon and color absent", async () => {
  const id = await wsIdOf("pia");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("pia"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  const group = ((await put.json()) as SidebarLayout).groups[0] ?? {};
  expect("icon" in group).toBe(false);
  expect("color" in group).toBe(false);
});

test("stored layouts drop unsupported fields on read", () => {
  expect(
    readSidebarLayout(
      JSON.stringify({
        groups: [{ ...LAYOUT.groups[0], unsupported: "unused" }],
        order: [
          { kind: "agent", id: "a3" },
          { kind: "group", id: "g1" },
        ],
        unsupported: true,
      }),
    ),
  ).toEqual(LAYOUT);
});

test("parser requires v2 order entries and strips unknown keys", () => {
  expect(parseSidebarLayout({ groups: [], ungroupedOrder: [] })).toBeNull();
  expect(
    parseSidebarLayout({ groups: [], order: [{ kind: "nested", id: "g" }] }),
  ).toBeNull();
  expect(
    parseSidebarLayout({ groups: [], order: [{ kind: "agent", id: 1 }] }),
  ).toBeNull();
  expect(parseSidebarLayout({ groups: [], order: [null] })).toBeNull();
  expect(
    parseSidebarLayout({
      groups: [],
      order: [{ kind: "agent", id: "a", context: "ignored" }],
      defaultCollapsed: true,
      ungroupedOrder: ["b"],
    }),
  ).toEqual({
    groups: [],
    order: [{ kind: "agent", id: "a" }],
  });
});
