import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type MobileMoreGroup,
  mobileMoreItems,
} from "../src/components/shell/mobile-more-items.ts";

// The phone More menu's model: the rail's own destination runs, minus the
// ones a gate emptied. The rail composes ONE
// unlabelled run today; the mapper mirrors the library's section shape, bands
// and all, so the menu draws whatever the rail hands it.

const requireSource = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const row = (id: string): MobileMoreGroup["items"][number] => ({
  id,
  label: id,
  icon: null,
  onClick: () => {},
});

describe("mobileMoreItems", () => {
  it("keeps the rail's runs, labels and order", () => {
    const groups = mobileMoreItems([
      {
        id: "primary",
        items: [row("assistant"), row("ai-hub"), row("integrations")],
      },
      { id: "teams", label: "Your AI Employees", items: [row("team")] },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.label, g.items.map((i) => i.id)]),
      [
        ["primary", undefined, ["assistant", "ai-hub", "integrations"]],
        ["teams", "Your AI Employees", ["team"]],
      ],
    );
  });

  it("drops a run its gates emptied, band and all", () => {
    // A heading must never outlive the rows it names — the same rule the rail
    // library applies to its own sections.
    const groups = mobileMoreItems([
      { id: "primary", items: [row("assistant")] },
      { id: "teams", label: "Your AI Employees", items: [] },
    ]);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["primary"],
    );
  });
});

describe("mobile More screen rows", () => {
  it("gates Admin and omits the Help group", () => {
    const source = requireSource(
      "../src/components/shell/mobile-more-menu.tsx",
    );
    assert.ok(
      source.includes(
        "{showOrganization && <MobileMoreRowButton row={admin} />}",
      ),
    );
    assert.ok(source.includes('"data-testid": "rail-admin"'));
    assert.ok(!source.includes("mobileMoreFooterRows"));
    assert.ok(!source.includes("moreMenu.help"));
  });
});
