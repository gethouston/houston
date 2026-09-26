import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { submitNewGroup } from "../src/components/shell/new-group-submit.ts";

function harness(created: string | null) {
  const calls = {
    created: [] as { name: string; icon?: string; color?: string }[],
    closed: 0,
    reported: [] as string[],
  };
  const deps = {
    createGroup: (
      name: string,
      identity: { icon?: string; color?: string },
    ) => {
      calls.created.push({ name, ...identity });
      return created;
    },
    onCreated: () => {
      calls.closed++;
    },
    report: (command: string, err: unknown) => {
      ok(err instanceof Error);
      calls.reported.push(command);
    },
  };
  return { calls, deps };
}

describe("submitNewGroup", () => {
  it("creates the trimmed group synchronously and closes the dialog", () => {
    const { calls, deps } = harness("grp_1");
    const result = submitNewGroup({ name: "  Sales ", icon: "star" }, deps);
    strictEqual(result, undefined);
    deepStrictEqual(calls.created, [
      { name: "Sales", icon: "star", color: undefined },
    ]);
    strictEqual(calls.closed, 1);
    deepStrictEqual(calls.reported, []);
  });

  it("reports a group that could not be written and keeps the dialog open", () => {
    const { calls, deps } = harness(null);
    submitNewGroup({ name: "Sales" }, deps);
    strictEqual(calls.closed, 0);
    deepStrictEqual(calls.reported, ["sidebar_group_create"]);
  });

  it("submits nothing for an empty or over-long name", () => {
    const { calls, deps } = harness("grp_1");
    submitNewGroup({ name: "   " }, deps);
    submitNewGroup({ name: "a".repeat(500) }, deps);
    deepStrictEqual(calls.created, []);
    deepStrictEqual(calls.reported, []);
  });
});
