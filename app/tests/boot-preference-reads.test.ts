import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A DEVICE preference read rejects when this browser's localStorage refuses the
 * read (blocked site data, partitioned webview) — the adapter no longer reports
 * a store that cannot answer as an unset preference. Every BOOT reader of one
 * therefore has to take the rejection as "unset" and report it: the two sites
 * below awaited a preference alongside a LOAD, so a blocked store handed the
 * user the workspace-load failure screen with no agents, over an account whose
 * spaces had listed perfectly well.
 *
 * `readBootPreference` is the one place that resolution lives, and
 * `packages/web/tests/device-prefs-storage.test.ts` pins its behavior (unset +
 * one report) and the store's whole `loadWorkspaces` path against a rejecting
 * device store. What is asserted HERE is that no boot reader keeps its own
 * handling: the hook cannot be driven under this suite's runner (a React hook,
 * and the tauri barrel does not load here — same constraint and pattern as
 * `error-report-connectivity.test.ts`), and the shape is the invariant anyway.
 */

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const BOOT_READERS = [
  "../src/hooks/use-houston-init.ts",
  "../src/stores/workspaces.ts",
];

describe("boot readers of a device preference", () => {
  for (const file of BOOT_READERS) {
    it(`${file} reads through readBootPreference, never tauriPreferences.get`, () => {
      const source = read(file);
      ok(
        source.includes('from "../lib/boot-preference"'),
        `${file} must import the shared boot read`,
      );
      ok(
        source.includes("readBootPreference("),
        `${file} must call readBootPreference`,
      );
      strictEqual(
        source.includes("tauriPreferences.get("),
        false,
        `${file} must not read a preference straight off the barrel: the rejection would reach the load's catch`,
      );
    });

    it(`${file} does not swallow the read with a console.error`, () => {
      const source = read(file);
      strictEqual(
        /console\.error\((?:.|\n)*?(?:preference|workspace|agent)/i.test(
          source,
        ),
        false,
        `${file} must report a failed read (logAndReportError via readBootPreference), not log it`,
      );
    });
  }

  it("the space list and the restored id no longer share one catch", () => {
    const source = read("../src/stores/workspaces.ts");
    const load = source.slice(
      source.indexOf("loadWorkspaces: async () => {"),
      source.indexOf("refreshWorkspaces: async () => {"),
    );
    ok(load.includes("tauriWorkspaces.list()"), "the load lists the spaces");
    ok(
      load.includes('readBootPreference("last_workspace_id")'),
      "the restored id is read through the boot read, so only the list can fail the load",
    );
  });

  it("readBootPreference reports with a device_pref_unreadable code", () => {
    const source = read("../src/lib/boot-preference.ts");
    ok(
      /logAndReportError\(`device_pref_unreadable:\$\{key\}`/.test(source),
      "the report names the failure and the key",
    );
    ok(
      source.includes("return null;"),
      "an unreadable device preference resolves as unset",
    );
  });
});
