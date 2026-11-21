import { describe, expect, it } from "vitest";
import {
  compareBaseline,
  ratchetBaseline,
  renderBaseline,
} from "../baseline.ts";
import { planDeletions } from "../plan.ts";

describe("the baseline ratchet", () => {
  it("flags a file over its entry and a file under it", () => {
    const drift = compareBaseline(
      { "a.ts": 3, "b.ts": 1, "new.ts": 1 },
      { "a.ts": 2, "b.ts": 4 },
    );
    expect(drift.over).toEqual([
      { file: "a.ts", count: 3, allowed: 2 },
      { file: "new.ts", count: 1, allowed: 0 },
    ]);
    expect(drift.under).toEqual([{ file: "b.ts", count: 1, allowed: 4 }]);
  });

  it("refuses to raise an entry or add a file", () => {
    const { raised } = ratchetBaseline(
      { "a.ts": 3, "new.ts": 1 },
      { "a.ts": 2 },
    );
    expect(raised.map((drift) => drift.file)).toEqual(["a.ts", "new.ts"]);
  });

  it("lowers entries and drops files that reach zero", () => {
    const { next, raised } = ratchetBaseline(
      { "b.ts": 1 },
      { "a.ts": 2, "b.ts": 4 },
    );
    expect(raised).toEqual([]);
    expect(next).toEqual({ "b.ts": 1 });
  });

  it("writes sorted keys in a stable layout", () => {
    expect(renderBaseline({ "z.ts": 1, "a.ts": 2, "gone.ts": 0 })).toBe(
      '{\n  "a.ts": 2,\n  "z.ts": 1\n}\n',
    );
  });
});

describe("comments:apply planning", () => {
  const files: Record<string, string> = {
    "a.ts": "// @ts-expect-error fake\nf(1); // why\n",
  };
  const input = {
    inScope: () => true,
    read: (file: string) => files[file],
    pinned: [],
  };

  it("deletes the comments it is given", () => {
    const plan = planDeletions([{ id: "a.ts:2:7", action: "delete" }], input);
    expect(plan.errors).toEqual([]);
    expect(plan.edits).toEqual([
      { file: "a.ts", after: "// @ts-expect-error fake\nf(1);\n", count: 1 },
    ]);
  });

  it("refuses tooling comments and unknown ids", () => {
    const plan = planDeletions(
      [
        { id: "a.ts:1:1", action: "delete" },
        { id: "a.ts:9:1", action: "delete" },
        { id: "a.ts:2:7", action: "keep" },
      ],
      input,
    );
    const errors = plan.errors.join("\n");
    expect(plan.errors).toHaveLength(3);
    expect(errors).toMatch(/a\.ts:1:1 is a tooling comment/);
    expect(errors).toMatch(/a\.ts:9:1: no comment starts here/);
    expect(errors).toMatch(/"action":"keep"/);
    expect(plan.edits).toEqual([]);
  });
});
