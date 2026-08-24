import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backfillRoutineCreatedBy } from "./routine-created-by";

/**
 * The managed-pod boot backfill that stamps the org owner as `created_by` on
 * routines recorded before gateway-fronted pods stamped acting identities.
 * What matters: an authorless entry gains the owner sub (the control-plane
 * planner refuses to fire without one), an authored entry keeps its author, a
 * doc with nothing to stamp is not rewritten, and one bad doc never stops the
 * sweep.
 */

let root: string;

const routinesPath = (agentRoot: string) =>
  join(agentRoot, ".houston", "routines", "routines.json");

function writeRoutines(agentRoot: string, value: unknown): void {
  mkdirSync(join(agentRoot, ".houston", "routines"), { recursive: true });
  writeFileSync(
    routinesPath(agentRoot),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    "utf8",
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routine-created-by-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("backfillRoutineCreatedBy", () => {
  it("stamps authorless routines and keeps authored ones", () => {
    const agent = join(root, "Personal", "Alfred");
    writeRoutines(agent, [
      { id: "r1", name: "Brief", prompt: "p", schedule: "0 9 * * *" },
      {
        id: "r2",
        name: "Report",
        prompt: "p",
        schedule: "0 8 * * *",
        created_by: "supabase-sub-1",
      },
      { id: "r3", name: "Empty author", prompt: "p", created_by: "" },
    ]);

    const result = backfillRoutineCreatedBy({
      workspacesRoot: root,
      ownerSub: "owner-sub",
      log: () => {},
    });

    expect(result).toEqual({ updatedAgents: 1, updatedRoutines: 2 });
    const items = JSON.parse(readFileSync(routinesPath(agent), "utf8")) as {
      id: string;
      created_by?: string;
    }[];
    expect(items.map((r) => r.created_by)).toEqual([
      "owner-sub",
      "supabase-sub-1",
      "owner-sub",
    ]);
  });

  it("is a no-op the second time (fully-authored docs are never rewritten)", () => {
    const agent = join(root, "Personal", "Alfred");
    writeRoutines(agent, [
      { id: "r1", name: "Brief", prompt: "p", schedule: "0 9 * * *" },
    ]);
    backfillRoutineCreatedBy({
      workspacesRoot: root,
      ownerSub: "owner-sub",
      log: () => {},
    });
    const mtime = statSync(routinesPath(agent)).mtimeMs;

    const again = backfillRoutineCreatedBy({
      workspacesRoot: root,
      ownerSub: "owner-sub",
      log: () => {},
    });

    expect(again).toEqual({ updatedAgents: 0, updatedRoutines: 0 });
    expect(statSync(routinesPath(agent)).mtimeMs).toBe(mtime);
  });

  it("skips agents with no routines doc and tolerates a malformed one", () => {
    mkdirSync(join(root, "Personal", "NoRoutines", ".houston"), {
      recursive: true,
    });
    const broken = join(root, "Personal", "Broken");
    writeRoutines(broken, "{not json");
    const healthy = join(root, "Personal", "Healthy");
    writeRoutines(healthy, [{ id: "r1", name: "n", prompt: "p" }]);
    // A non-array doc (agent-authored garbage) is the read path's diagnostic
    // to report, not ours to rewrite.
    const object = join(root, "Personal", "ObjectDoc");
    writeRoutines(object, { items: [] });

    const result = backfillRoutineCreatedBy({
      workspacesRoot: root,
      ownerSub: "owner-sub",
      log: () => {},
    });

    expect(result).toEqual({ updatedAgents: 1, updatedRoutines: 1 });
    expect(readFileSync(routinesPath(broken), "utf8")).toBe("{not json");
    expect(readFileSync(routinesPath(object), "utf8")).toContain("items");
  });

  it("preserves unknown keys and stray non-object entries verbatim", () => {
    const agent = join(root, "Personal", "Alfred");
    writeRoutines(agent, [
      { id: "r1", name: "n", prompt: "p", some_future_key: { a: 1 } },
      "stray string entry",
    ]);

    backfillRoutineCreatedBy({
      workspacesRoot: root,
      ownerSub: "owner-sub",
      log: () => {},
    });

    const items = JSON.parse(
      readFileSync(routinesPath(agent), "utf8"),
    ) as unknown[];
    expect(items[0]).toEqual({
      id: "r1",
      name: "n",
      prompt: "p",
      some_future_key: { a: 1 },
      created_by: "owner-sub",
    });
    expect(items[1]).toBe("stray string entry");
  });
});
