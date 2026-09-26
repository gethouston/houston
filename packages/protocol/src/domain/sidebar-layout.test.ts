import { describe, expect, test } from "vitest";
import {
  normalizeSidebarLayout,
  parseSidebarLayout,
  SIDEBAR_GROUP_NAME_MAX_CODE_POINTS,
  sidebarGroupNameTooLong,
} from "../index";

const group = (id: string, agentIds: string[]) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
});

describe("group name limit", () => {
  test("counts code points, so emoji names fit", () => {
    const max = "😀".repeat(SIDEBAR_GROUP_NAME_MAX_CODE_POINTS);
    expect(sidebarGroupNameTooLong(max)).toBe(false);
    expect(sidebarGroupNameTooLong(`${max}x`)).toBe(true);
  });
});

describe("parseSidebarLayout", () => {
  test("accepts ids and styles up to their byte limits", () => {
    const layout = {
      groups: [
        {
          ...group("g".repeat(128), ["a"]),
          name: "Ops",
          icon: "i".repeat(64),
          color: "c",
        },
      ],
      order: [{ kind: "group", id: "g".repeat(128) }],
    };
    expect(parseSidebarLayout(layout)).toEqual(layout);
  });

  test("counts ids in UTF-8 bytes, like the gateway", () => {
    const id = "é".repeat(65);
    expect(
      parseSidebarLayout({ groups: [group(id, [])], order: [] }),
    ).toBeNull();
  });

  test("caps agent ids across group members and top-level rows", () => {
    const members = Array.from({ length: 2000 }, (_, i) => `a${i}`);
    const full = { groups: [group("g", members)], order: [] };
    expect(parseSidebarLayout(full)).not.toBeNull();
    expect(
      parseSidebarLayout({ ...full, order: [{ kind: "agent", id: "extra" }] }),
    ).toBeNull();
  });
});

describe("normalizeSidebarLayout", () => {
  test("always yields a layout the strict parser accepts", () => {
    const inputs: unknown[] = [
      null,
      "corrupt",
      { groups: "x", order: 3 },
      {
        groups: [
          group("g", ["a", "a", ""]),
          group("g", ["b"]),
          { ...group("h", ["a", "c"]), name: "n".repeat(90), icon: 7 },
          { id: "no-name" },
        ],
        order: [
          { kind: "agent", id: "c" },
          { kind: "agent", id: "d" },
          { kind: "group", id: "missing" },
          { kind: "agent", id: "d" },
        ],
      },
      { groups: [group("g", [])], ungroupedOrder: ["x", 4, "", "x"] },
    ];
    for (const input of inputs) {
      const normalized = normalizeSidebarLayout(input);
      expect(parseSidebarLayout(normalized)).toEqual(normalized);
    }
  });

  test("converts a legacy ungroupedOrder after the groups", () => {
    expect(
      normalizeSidebarLayout({
        groups: [group("g", ["a"])],
        ungroupedOrder: ["a", "b"],
      }),
    ).toEqual({
      groups: [group("g", ["a"])],
      order: [
        { kind: "group", id: "g" },
        { kind: "agent", id: "b" },
      ],
    });
  });
});
