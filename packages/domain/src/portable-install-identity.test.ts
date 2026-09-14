import { PORTABLE_FORMAT_VERSION, type Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import type { PortablePackage } from "./portable";
import { remintRoutineIds } from "./portable-install-identity";
import { createRoutine } from "./routines";

const NOW = "2026-06-13T00:00:00.000Z";

const pkg = (routines: Routine[]): PortablePackage => ({
  manifest: {
    agentName: "Sales",
    houstonVersion: "0.5.0",
    createdAt: NOW,
    anonymized: false,
    formatVersion: PORTABLE_FORMAT_VERSION,
  },
  claudeMd: "# Role",
  skills: [{ slug: "research", body: "---\nname: research\n---\n" }],
  routines,
  learnings: [{ id: "l1", text: "concise", created_at: NOW }],
});

const mintFrom = (ids: string[]) => {
  let i = 0;
  return () => ids[i++] ?? `extra-${i}`;
};

test("every installed routine gets a fresh id, and the map says which was which", () => {
  const daily = createRoutine(
    { name: "Daily", prompt: "check", schedule: "0 9 * * *" },
    "r1",
    NOW,
  );
  const hook: Routine = {
    ...createRoutine({ name: "Hook", prompt: "react" }, "r2", NOW),
    trigger: { kind: "webhook", key_prefix: "wh_3992d3f6" },
  };
  const source = pkg([daily, hook]);
  const { pkg: out, routineIds } = remintRoutineIds(
    source,
    mintFrom(["n1", "n2"]),
  );
  expect(routineIds).toEqual({ r1: "n1", r2: "n2" });
  expect(out.routines.map((r) => [r.id, r.name])).toEqual([
    ["n1", "Daily"],
    ["n2", "Hook"],
  ]);
  // The source's minted address does not travel: the copy has no key yet.
  expect(out.routines[1]?.trigger).toEqual({ kind: "webhook" });
  // Everything else rides along untouched.
  expect(out.claudeMd).toBe("# Role");
  expect(out.skills).toHaveLength(1);
  expect(out.learnings).toHaveLength(1);
  expect(out.manifest).toBe(source.manifest);
  // The source package is not mutated.
  expect(source.routines.map((r) => r.id)).toEqual(["r1", "r2"]);
});

test("a composio trigger and a cron schedule keep their binding under the new id", () => {
  const composio: Routine = {
    ...createRoutine({ name: "Mail", prompt: "triage" }, "r3", NOW),
    trigger: {
      toolkit: "gmail",
      trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
      trigger_config: { labelIds: "INBOX" },
    },
  };
  const { pkg: out } = remintRoutineIds(pkg([composio]), mintFrom(["n3"]));
  expect(out.routines[0]?.trigger).toEqual(composio.trigger);
  expect(out.routines[0]?.id).toBe("n3");
});

test("no routines means no map and no change", () => {
  const { pkg: out, routineIds } = remintRoutineIds(pkg([]), mintFrom([]));
  expect(routineIds).toEqual({});
  expect(out.routines).toEqual([]);
});
