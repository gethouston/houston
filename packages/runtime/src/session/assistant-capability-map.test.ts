import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { ASSISTANT_UNSERVED_ENV } from "@houston/domain/assistant-deployment";
import { expect, test } from "vitest";
import { assistantCapabilityMap } from "./assistant-capability-map";

/**
 * The map the coordinator carries, narrowed to what its own Houston serves.
 *
 * The rule it enforces is one sentence: a name in this map is a name the model
 * may promise the user. Everything below is a way that could stop being true —
 * a stamp that filters nothing, a stamp that filters a whole area, a stamp for
 * a name the catalog does not have.
 */

const map = (unserved: string[]) =>
  assistantCapabilityMap(
    unserved.length > 0 ? { [ASSISTANT_UNSERVED_ENV]: unserved.join(",") } : {},
  );

/** The operations one rendered map LISTS, read out of its group lines. */
const listed = (index: string) =>
  new Set(
    index
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .flatMap((line) => (line.split(": ")[1] ?? "").split(", ")),
  );

test("no stamp is the whole generated index, byte for byte", () => {
  expect(assistantCapabilityMap({})).toBe(ASSISTANT_CAPABILITY_INDEX);
});

test("a stamped operation leaves the map and its group stays", () => {
  const before = listed(ASSISTANT_CAPABILITY_INDEX);
  expect(before.has("listRoutines")).toBe(true);
  expect(before.has("createRoutine")).toBe(true);
  const after = listed(map(["listRoutines", "createRoutine"]));
  expect(after.has("listRoutines")).toBe(false);
  expect(after.has("createRoutine")).toBe(false);
  // The rest of the area is untouched: withholding two operations must not
  // read to the model as "Houston has no routines".
  expect(after.has("deleteRoutine")).toBe(true);
});

test("a group whose every operation is stamped disappears entirely", () => {
  const groupLine = (index: string, group: string) =>
    index.split("\n").find((line) => line.startsWith(`- ${group}: `));
  const workspaces = groupLine(ASSISTANT_CAPABILITY_INDEX, "workspaces");
  expect(workspaces).toBeDefined();
  const names = (workspaces ?? "").split(": ")[1]?.split(", ") ?? [];
  expect(names.length).toBeGreaterThan(0);
  // An empty heading is worse than no heading: it tells the model the area
  // exists and leaves it nothing to reach for.
  expect(groupLine(map(names), "workspaces")).toBeUndefined();
});

test("a stamp for a name this build does not have changes nothing", () => {
  // The host and the runtime can be one release apart in a managed rollout, so
  // an unknown name must be inert rather than an error or a silent truncation.
  expect(map(["thisOperationDoesNotExist"])).toBe(ASSISTANT_CAPABILITY_INDEX);
});

test("the map keeps the wording the generator wrote", () => {
  const narrowed = map(["listRoutines"]);
  expect(narrowed.split("\n")[0]).toBe(
    ASSISTANT_CAPABILITY_INDEX.split("\n")[0],
  );
  expect(narrowed).toContain(
    "Read one with houston_describe before you use it, then perform it with houston_call.",
  );
});
