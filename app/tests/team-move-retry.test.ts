import { deepStrictEqual, match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TeamMoveSource, TeamMoveState } from "../src/lib/move-team.ts";
import { closedPostscriptFailureToast } from "../src/lib/team-move-retry.ts";

const source: TeamMoveSource = {
  id: "grp_sales",
  workspaceId: "ws-1",
  name: "Sales",
  agents: [{ id: "a", name: "Ada" }],
};
const target = { slug: "acme", name: "Acme" };
const copy = { title: "Sales could not finish moving.", retry: "Try again" };

describe("closing an unfinished folder move", () => {
  it("keeps Retry reachable once the source folder is gone", () => {
    const reopened: TeamMoveSource[] = [];
    const toast = closedPostscriptFailureToast(
      { step: "postscriptFailed", target, stage: "switching" },
      source,
      copy,
      (from) => reopened.push(from),
    );
    strictEqual(toast?.variant, "error");
    strictEqual(toast?.title, copy.title);
    strictEqual(toast?.action?.label, copy.retry);
    toast?.action?.onClick();
    deepStrictEqual(reopened, [source]);
  });

  it("leaves the folder's own menu as the way back while it still exists", () => {
    for (const stage of ["createTarget", "cleanupSource"] as const) {
      const state: TeamMoveState = { step: "postscriptFailed", target, stage };
      strictEqual(
        closedPostscriptFailureToast(state, source, copy, () => {}),
        null,
      );
    }
  });

  it("is what the failure face's Close shows", () => {
    const flow = readFileSync(
      new URL(
        "../src/components/team-view/team-move-flow.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const face = flow.slice(flow.indexOf('state.step === "postscriptFailed"'));
    match(face, /onClose=\{closeUnfinished\}/);
    match(flow, /closedPostscriptFailureToast\(/);
  });
});
