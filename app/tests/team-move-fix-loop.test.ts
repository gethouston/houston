import { deepStrictEqual, match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston/engine-adapter";
import { QueryClient } from "@tanstack/react-query";
import {
  claimTeamMove,
  releaseTeamMove,
} from "../src/lib/pending-team-move.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import {
  beginPostscriptRetry,
  releaseOwnedTeamMove,
} from "../src/lib/team-move-claim.ts";
import { canMoveFolderToSpace } from "../src/lib/team-move-eligibility.ts";
import { writeTeamMoveLayout } from "../src/lib/team-move-layout-write.ts";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("folder move review regressions", () => {
  it("M1 releases a dialog claim when its owner unmounts", () => {
    strictEqual(claimTeamMove("m1"), true);
    const ownership = { current: true };
    releaseOwnedTeamMove("m1", ownership);
    strictEqual(ownership.current, false);
    strictEqual(claimTeamMove("m1"), true);
    releaseTeamMove("m1");
  });

  it("M3 hides move unless every agent is manageable and a destination exists", () => {
    const caps: Capabilities = {
      profile: "cloud",
      revealInOs: false,
      terminal: false,
      tunnel: false,
      codeExecution: "remote-sandbox",
      providers: [],
      openaiCompatible: false,
      integrations: [],
      multiplayer: true,
      role: "user",
      spaces: true,
    };
    const agents = [
      { access: "manager" as const },
      { access: "user" as const },
    ];
    const destinations = [
      {
        kind: "team" as const,
        role: "owner" as const,
        slug: "acme",
        name: "Acme",
      },
    ];
    strictEqual(canMoveFolderToSpace(true, caps, agents, destinations), false);
    strictEqual(
      canMoveFolderToSpace(true, caps, agents.slice(0, 1), destinations),
      true,
    );
    strictEqual(
      canMoveFolderToSpace(true, caps, agents.slice(0, 1), []),
      false,
    );
  });

  it("M4 composes postscript changes behind a queued layout write", async () => {
    const qc = new QueryClient();
    const id = "default";
    const initial = { groups: [], order: [] };
    qc.setQueryData(queryKeys.sidebarLayout(id), initial);
    const saved: string[][] = [];
    const first = writeTeamMoveLayout(
      qc,
      id,
      (layout) => ({ ...layout, order: [{ kind: "agent", id: "first" }] }),
      async (layout) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        saved.push(layout.order.map((entry) => entry.id));
        return layout;
      },
      () => {},
    );
    const second = writeTeamMoveLayout(
      qc,
      id,
      (layout) => ({
        ...layout,
        order: [...layout.order, { kind: "group", id: "folder" }],
      }),
      async (layout) => {
        saved.push(layout.order.map((entry) => entry.id));
        return layout;
      },
      () => {},
    );
    await Promise.all([first, second]);
    deepStrictEqual(saved, [["first"], ["first", "folder"]]);
  });

  it("M5 leaves Retry on the failure face while boot resume owns the claim", () => {
    strictEqual(claimTeamMove("m5"), true);
    const ownership = { current: false };
    let busy = false;
    strictEqual(
      beginPostscriptRetry("m5", ownership, () => {
        busy = true;
      }),
      false,
    );
    strictEqual(busy, false);
    releaseTeamMove("m5");
  });

  it("binds each regression helper at its production call site", () => {
    const flow = source("hooks/use-team-move-flow.ts");
    match(
      flow,
      /return \(\) => \{\s*mounted\.current = false;\s*releaseOwnedTeamMove\(source\.id, ownsClaim\);/,
    );
    match(flow, /!beginPostscriptRetry\(source\.id, ownsClaim,/);
    match(
      source("components/shell/team-folder-menu.tsx"),
      /canMoveFolderToSpace\(/,
    );
    match(
      source("lib/team-move-postscript-wire.ts"),
      /updateLayout: \(id: string, op: \(layout: SidebarLayout\) => SidebarLayout\) =>\s*writeTeamMoveLayout\(/,
    );
  });
});
