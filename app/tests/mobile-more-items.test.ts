import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type MobileMoreGroup,
  mobileMoreFooterRows,
  mobileMoreItems,
} from "../src/components/shell/mobile-more-items.ts";

// The phone More menu's model: the rail's own destination runs, minus the
// ones a gate emptied, plus the two help actions.

const row = (id: string): MobileMoreGroup["items"][number] => ({
  id,
  label: id,
  icon: null,
  onClick: () => {},
});

describe("mobileMoreItems", () => {
  it("keeps the rail's runs, labels and order", () => {
    const groups = mobileMoreItems([
      { id: "primary", items: [row("inbox"), row("store")] },
      { id: "my-accounts", label: "My accounts", items: [row("integrations")] },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.label, g.items.map((i) => i.id)]),
      [
        ["primary", undefined, ["inbox", "store"]],
        ["my-accounts", "My accounts", ["integrations"]],
      ],
    );
  });

  it("drops a run its gates emptied, band and all", () => {
    // A heading must never outlive the rows it names — the same rule the rail
    // library applies to its own sections.
    const groups = mobileMoreItems([
      { id: "primary", items: [row("inbox")] },
      { id: "workspace", label: "Workspace", items: [] },
    ]);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["primary"],
    );
  });
});

describe("mobileMoreFooterRows", () => {
  it("names the two help actions, in order, wired to their handlers", () => {
    let guided = 0;
    let reported = 0;
    const rows = mobileMoreFooterRows({
      guideMe: "Guide me",
      reportProblem: "Report a problem",
      onGuideMe: () => {
        guided += 1;
      },
      onReportProblem: () => {
        reported += 1;
      },
    });
    assert.deepEqual(
      rows.map((r) => [r.id, r.label]),
      [
        ["guideMe", "Guide me"],
        ["reportProblem", "Report a problem"],
      ],
    );
    rows[0].onSelect();
    rows[1].onSelect();
    assert.equal(guided, 1);
    assert.equal(reported, 1);
  });
});
