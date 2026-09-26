import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSidebarSections,
  type SidebarGroupView,
} from "../src/sidebar-groups.ts";

const item = (id: string) => ({ id, name: id });
const group = (id: string, itemIds: string[]): SidebarGroupView => ({
  id,
  name: id,
  collapsed: false,
  itemIds,
});

const sequence = (sections: ReturnType<typeof computeSidebarSections>) =>
  sections.flatMap((section) =>
    section.rootAgentId
      ? [`agent:${section.rootAgentId}`]
      : section.groupId
        ? [`group:${section.groupId}`]
        : [],
  );

describe("computeSidebarSections", () => {
  it("places fresh root employees first and missing groups last", () => {
    const sections = computeSidebarSections(
      [item("a"), item("b"), item("c")],
      [group("g", ["b"])],
      [{ kind: "agent", id: "c" }],
    );
    deepStrictEqual(sequence(sections), ["agent:a", "agent:c", "group:g"]);
    deepStrictEqual(
      sections[2].items.map((entry) => entry.id),
      ["b"],
    );
  });

  it("interleaves root employees with groups", () => {
    const sections = computeSidebarSections(
      [item("a"), item("b"), item("c")],
      [group("g1", ["b"]), group("g2", [])],
      [
        { kind: "group", id: "g2" },
        { kind: "agent", id: "a" },
        { kind: "group", id: "g1" },
        { kind: "agent", id: "c" },
      ],
    );
    deepStrictEqual(sequence(sections), [
      "group:g2",
      "agent:a",
      "group:g1",
      "agent:c",
    ]);
    deepStrictEqual(sections.length, 4);
  });

  it("has no synthetic root section when every employee is grouped", () => {
    const sections = computeSidebarSections([item("a")], [group("g", ["a"])]);
    deepStrictEqual(sequence(sections), ["group:g"]);
  });

  it("assigns a duplicated employee to the first group and ignores stale order", () => {
    const sections = computeSidebarSections(
      [item("a"), item("b")],
      [group("first", ["a"]), group("second", ["a", "b"])],
      [
        { kind: "agent", id: "a" },
        { kind: "group", id: "missing" },
      ],
    );
    deepStrictEqual(sequence(sections), ["group:first", "group:second"]);
    deepStrictEqual(
      sections[0].items.map((entry) => entry.id),
      ["a"],
    );
    deepStrictEqual(
      sections[1].items.map((entry) => entry.id),
      ["b"],
    );
  });
});
