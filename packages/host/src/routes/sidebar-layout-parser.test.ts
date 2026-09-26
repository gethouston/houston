import { expect, test } from "vitest";
import {
  DEFAULT_SIDEBAR_LAYOUT,
  parseSidebarLayout,
  readSidebarLayout,
} from "./sidebar-layout";

const group = { id: "g", name: "Work", collapsed: false, agentIds: ["inside"] };

test("parser validates the mixed root order and projects the pinned shape", () => {
  const input = {
    groups: [{ ...group, context: "removed" }],
    order: [
      { kind: "agent", id: "a", defaultCollapsed: true },
      { kind: "group", id: "g", extra: 1 },
    ],
    ungroupedOrder: ["b"],
    context: "removed",
  };
  expect(parseSidebarLayout(input)).toEqual({
    groups: [group],
    order: [
      { kind: "agent", id: "a" },
      { kind: "group", id: "g" },
    ],
  });
  expect(readSidebarLayout(JSON.stringify(input))).toEqual(
    parseSidebarLayout(input),
  );
});

test("parser rejects missing order, malformed entries and malformed groups", () => {
  for (const input of [
    { groups: [], ungroupedOrder: [] },
    { groups: [], order: [null] },
    { groups: [], order: [{ kind: "nested", id: "g" }] },
    { groups: [], order: [{ kind: "agent", id: 1 }] },
    { groups: [{ ...group, collapsed: "no" }], order: [] },
  ])
    expect(parseSidebarLayout(input)).toBeNull();
});

test("corrupt stored documents read as the empty v2 layout", () => {
  expect(readSidebarLayout(null)).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  expect(readSidebarLayout("{broken")).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  expect(
    readSidebarLayout(JSON.stringify({ groups: [], ungroupedOrder: [] })),
  ).toEqual(DEFAULT_SIDEBAR_LAYOUT);
});

test("parser rejects duplicate references and cloud layout caps", () => {
  const valid = { groups: [group], order: [{ kind: "group", id: "g" }] };
  const invalid = [
    { ...valid, groups: [group, group] },
    {
      ...valid,
      groups: [group, { ...group, id: "other", agentIds: ["inside"] }],
    },
    { ...valid, order: [...valid.order, { kind: "agent", id: "inside" }] },
    { ...valid, order: [...valid.order, valid.order[0]] },
    { ...valid, order: [{ kind: "group", id: "missing" }] },
    { ...valid, groups: [{ ...group, name: "x".repeat(61) }] },
    { ...valid, groups: [{ ...group, id: "x".repeat(129) }] },
    { groups: [], order: [{ kind: "agent", id: "x".repeat(129) }] },
    {
      groups: Array.from({ length: 201 }, (_, i) => ({
        ...group,
        id: `g${i}`,
        agentIds: [],
      })),
      order: [],
    },
    {
      groups: [
        { ...group, agentIds: Array.from({ length: 2001 }, (_, i) => `a${i}`) },
      ],
      order: [],
    },
  ];
  for (const layout of invalid) expect(parseSidebarLayout(layout)).toBeNull();
});

test("parser counts a group name in code points, like the gateway", () => {
  const name = "😀".repeat(60);
  const layout = {
    groups: [{ ...group, name }],
    order: [{ kind: "group", id: "g" }],
  };
  expect(parseSidebarLayout(layout)?.groups[0]?.name).toBe(name);
  expect(
    parseSidebarLayout({ ...layout, groups: [{ ...group, name: `${name}x` }] }),
  ).toBeNull();
});

test("parser rejects empty ids and oversized icon or color, like the gateway", () => {
  const valid = { groups: [group], order: [{ kind: "group", id: "g" }] };
  expect(
    parseSidebarLayout({
      ...valid,
      groups: [{ ...group, icon: "i".repeat(64), color: "c".repeat(64) }],
    }),
  ).not.toBeNull();
  for (const input of [
    { groups: [{ ...group, id: "" }], order: [] },
    { ...valid, groups: [{ ...group, agentIds: [""] }] },
    { ...valid, order: [...valid.order, { kind: "agent", id: "" }] },
    { ...valid, groups: [{ ...group, icon: "i".repeat(65) }] },
    { ...valid, groups: [{ ...group, color: "c".repeat(65) }] },
  ])
    expect(parseSidebarLayout(input)).toBeNull();
});
