import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { SkillsManifest } from "@houston/engine-adapter";
import { QueryClient } from "@tanstack/react-query";
import {
  copiesRemoved,
  manifestsSet,
  sharedRemoved,
  withManifestEntry,
  withoutSharedSkill,
  withoutSkillCopy,
} from "../src/lib/skill-optimistic.ts";
import type { SkillSummary } from "../src/lib/types.ts";

const skill = (name: string) => ({ name }) as SkillSummary;
const manifest = (...enabled: string[]): SkillsManifest => ({
  version: 1,
  enabled,
});

describe("withoutSkillCopy", () => {
  it("drops the employee's copy and is a no-op once it is gone", () => {
    const keep = skill("b");
    const next = withoutSkillCopy([skill("a"), keep], "a");
    deepStrictEqual(next, [keep]);
    strictEqual(withoutSkillCopy(next, "a"), next);
    strictEqual(withoutSkillCopy(undefined, "a"), undefined);
  });
});

describe("withManifestEntry", () => {
  it("switches an entry on, sorted the way the host stores it", () => {
    deepStrictEqual(withManifestEntry(manifest("c", "a"), "b", true), {
      version: 1,
      enabled: ["a", "b", "c"],
    });
  });

  it("switches an entry off", () => {
    deepStrictEqual(withManifestEntry(manifest("a", "b"), "a", false), {
      version: 1,
      enabled: ["b"],
    });
  });

  it("changes nothing that already says so, or never loaded", () => {
    const on = manifest("a");
    strictEqual(withManifestEntry(on, "a", true), on);
    const off = manifest("b");
    strictEqual(withManifestEntry(off, "a", false), off);
    strictEqual(withManifestEntry(undefined, "a", true), undefined);
  });
});

describe("withoutSharedSkill", () => {
  it("drops the store skill from the list", () => {
    const list = { configured: true, diagnostics: [], items: [skill("a")] };
    deepStrictEqual(withoutSharedSkill(list, "a"), { ...list, items: [] });
  });

  it("passes the store's detail entries (same key prefix) through", () => {
    const detail = { name: "a", content: "# A" };
    strictEqual(withoutSharedSkill(detail, "a"), detail);
    strictEqual(withoutSharedSkill(undefined, "a"), undefined);
  });
});

describe("the patches, on a real cache", () => {
  it("reach each holder's own key and leave the store detail whole", () => {
    const qc = new QueryClient();
    qc.setQueryData(["skills", "/a"], [skill("x"), skill("y")]);
    qc.setQueryData(["skills", "/b"], [skill("x")]);
    qc.setQueryData(["skills-manifest", "/a"], manifest("x"));
    qc.setQueryData(["shared-skills", "w"], { items: [skill("x")] });
    const detail = { name: "x", content: "# X" };
    qc.setQueryData(["shared-skills", "w", "detail", "x"], detail);

    for (const patch of [
      ...copiesRemoved(["/a", "/b"], "x"),
      ...manifestsSet(["/a"], "x", false),
      sharedRemoved("w", "x"),
    ])
      qc.setQueriesData({ queryKey: patch.queryKey }, patch.apply);

    deepStrictEqual(qc.getQueryData(["skills", "/a"]), [skill("y")]);
    deepStrictEqual(qc.getQueryData(["skills", "/b"]), []);
    deepStrictEqual(qc.getQueryData(["skills-manifest", "/a"]), manifest());
    deepStrictEqual(qc.getQueryData(["shared-skills", "w"]), { items: [] });
    strictEqual(qc.getQueryData(["shared-skills", "w", "detail", "x"]), detail);
  });
});
