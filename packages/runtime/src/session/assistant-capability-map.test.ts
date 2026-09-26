import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { ASSISTANT_UNSERVED_ENV } from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { unservedOperations } from "@houston/host/src/assistant/served-operations";
import { listRoutes } from "@houston/host/src/routes/registry/all";
import { expect, test, vi } from "vitest";
import { assistantCapabilityMap } from "./assistant-capability-map";

/**
 * The embedded catalog, readable except when a test says otherwise. A build
 * whose catalog will not parse is the ONE branch nothing else can reach — it
 * needs a broken artifact — and it is the branch that decides whether a broken
 * build ships a manager that knows too much or one that knows nothing.
 */
const { unreadable } = vi.hoisted(() => ({ unreadable: { value: false } }));

vi.mock("@houston/host/src/assistant/catalog-source", async (importActual) => {
  const actual =
    await importActual<
      typeof import("@houston/host/src/assistant/catalog-source")
    >();
  return {
    ...actual,
    processAssistantCatalog: () =>
      unreadable.value ? null : actual.processAssistantCatalog(),
  };
});

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

test("a build whose catalog will not parse keeps the whole generated map", () => {
  // A coordinator that knows too much writes one wrong sentence; a coordinator
  // that knows nothing is a product with no assistant in it. The stamp is real
  // here, so the fallback is the only thing that can return the constant.
  unreadable.value = true;
  try {
    expect(map(["listRoutines"])).toBe(ASSISTANT_CAPABILITY_INDEX);
  } finally {
    unreadable.value = false;
  }
});

test("a stamp for a name this build does not have changes nothing", () => {
  // The host and the runtime can be one release apart in a managed rollout, so
  // an unknown name must be inert rather than an error or a silent truncation.
  expect(map(["thisOperationDoesNotExist"])).toBe(ASSISTANT_CAPABILITY_INDEX);
});

/**
 * What an unfronted desktop host stamps, worked out the way it works it out at
 * boot (`local/host-base.ts`): its own route table's answer, not a list copied
 * into a test that would go stale the day a route moves.
 */
const CATALOG = processAssistantCatalog();
if (!CATALOG) throw new Error("the embedded assistant catalog must load");

const DESKTOP_UNSERVED: readonly string[] = unservedOperations(
  CATALOG,
  listRoutes(),
);

/** Every operation some card reaches, whatever the card. */
const CARD_REACHED: readonly string[] = CATALOG.operations
  .filter((op) => op.hands?.kind === "card")
  .map((op) => op.name);

/** The preamble sentence naming what stays the person's own to do. */
const handsSentence = (index: string): string | undefined =>
  index
    .split("\n")
    .find((line) => line.startsWith("Some things are the person's own to do"));

/**
 * THE SENTENCE THAT PROMISES A SCREEN. The preamble is the only place the map
 * describes the hands-on errands, and a desktop has no billing page and no
 * key list — so a fixed phrase naming them teaches the manager to send the
 * person somewhere its own Houston cannot open.
 */
test("a desktop preamble names only the screens this Houston has", () => {
  expect(DESKTOP_UNSERVED).toHaveLength(47);
  const sentence = handsSentence(map([...DESKTOP_UNSERVED]));
  expect(sentence).toBe(
    "Some things are the person's own to do and are not in this list: connecting an app; giving an app its own key; signing in to an AI provider; files on their device. Hand those over with request_connection, request_credential, request_provider_connection or request_hands_on.",
  );
});

test("the hosted preamble names every screen the gateway serves", () => {
  expect(handsSentence(ASSISTANT_CAPABILITY_INDEX)).toBe(
    "Some things are the person's own to do and are not in this list: connecting an app; giving an app its own key; signing in to an AI provider; one-time keys, billing, files on their device, a routine's webhook and destroying a shared space. Hand those over with request_connection, request_credential, request_provider_connection or request_hands_on.",
  );
});

test("a deployment that reaches no card at all carries no preamble", () => {
  // An empty "some things are the person's own to do:" is worse than no
  // sentence: it names errands and hands the model nothing to reach them with.
  expect(handsSentence(map([...CARD_REACHED]))).toBeUndefined();
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
