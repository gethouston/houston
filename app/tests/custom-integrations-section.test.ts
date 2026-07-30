import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("custom integrations section error truth table", () => {
  it("the loud error state only replaces an EMPTY surface, never live rows", () => {
    const src = read(
      "../src/components/integrations/custom-integrations-section.tsx",
    );
    // A failed BACKGROUND refetch keeps `list.isError` true while `data`
    // still holds the last good list (React Query v5). Gating the error
    // panel on `data === undefined` keeps those rows on screen; dropping
    // the guard would erase the whole custom surface on one transient 500.
    ok(
      src.includes("list.isError && list.data === undefined"),
      "error state gates on isError AND no cached data",
    );
  });

  it("the add form's detect verdict is latest-check-wins", () => {
    const src = read("../src/components/integrations/custom-add-form.tsx");
    // A late detect result must never clobber a newer verdict, independent
    // of the Check button's disabled-while-pending coupling.
    ok(
      src.includes("seq !== checkSeq.current"),
      "stale detect results are dropped by sequence",
    );
  });
});
