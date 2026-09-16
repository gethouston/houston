import { deepStrictEqual } from "node:assert";
import { test } from "node:test";
import { headingItems } from "../src/components/shell/page-header/drilled-header-heading.ts";

/**
 * The drilled header's `<h1>` must name the screen the user is ON, at every
 * width: the phone's folded form reads the active lozenge as its heading, so
 * the wide cluster that headed a different lozenge would announce one screen
 * and show another.
 */

const items = [
  { id: "context", label: "Context" },
  { id: "agents", label: "Agents" },
  { id: "files", label: "Files" },
];

test("the active lozenge carries the heading", () => {
  deepStrictEqual(
    headingItems(items, "agents").map((item) => [item.id, item.heading]),
    [
      ["context", false],
      ["agents", true],
      ["files", false],
    ],
  );
});

test("a heading the caller set elsewhere moves to the active lozenge", () => {
  deepStrictEqual(
    headingItems(
      [
        { id: "context", label: "Context", heading: true },
        { id: "agents", label: "Agents" },
      ],
      "agents",
    ).map((item) => item.heading),
    [false, true],
  );
});

test("a lone lozenge heads its page", () => {
  deepStrictEqual(
    headingItems([{ id: "context", label: "Context" }], "context")[0].heading,
    true,
  );
});

test("an active id naming no lozenge leaves the list alone", () => {
  const caller = [
    { id: "context", label: "Context", heading: true },
    { id: "agents", label: "Agents" },
  ];
  deepStrictEqual(headingItems(caller, "missions"), caller);
});
