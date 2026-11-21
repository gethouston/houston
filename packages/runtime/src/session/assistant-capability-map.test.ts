import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { ASSISTANT_UNSERVED_ENV } from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { unservedOperations } from "@houston/host/src/assistant/served-operations";
import { listRoutes } from "@houston/host/src/routes/registry/all";
import { expect, test, vi } from "vitest";
import { assistantCapabilityMap } from "./assistant-capability-map";

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

const map = (unserved: string[]) =>
  assistantCapabilityMap(
    unserved.length > 0 ? { [ASSISTANT_UNSERVED_ENV]: unserved.join(",") } : {},
  );

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
  expect(after.has("deleteRoutine")).toBe(true);
});

test("a group whose every operation is stamped disappears entirely", () => {
  const groupLine = (index: string, group: string) =>
    index.split("\n").find((line) => line.startsWith(`- ${group}: `));
  const workspaces = groupLine(ASSISTANT_CAPABILITY_INDEX, "workspaces");
  expect(workspaces).toBeDefined();
  const names = (workspaces ?? "").split(": ")[1]?.split(", ") ?? [];
  expect(names.length).toBeGreaterThan(0);
  expect(groupLine(map(names), "workspaces")).toBeUndefined();
});

test("a build whose catalog will not parse keeps the whole generated map", () => {
  unreadable.value = true;
  try {
    expect(map(["listRoutines"])).toBe(ASSISTANT_CAPABILITY_INDEX);
  } finally {
    unreadable.value = false;
  }
});

test("a stamp for a name this build does not have changes nothing", () => {
  expect(map(["thisOperationDoesNotExist"])).toBe(ASSISTANT_CAPABILITY_INDEX);
});

const CATALOG = processAssistantCatalog();
if (!CATALOG) throw new Error("the embedded assistant catalog must load");

const DESKTOP_UNSERVED: readonly string[] = unservedOperations(
  CATALOG,
  listRoutes(),
);

const CARD_REACHED: readonly string[] = CATALOG.operations
  .filter((op) => op.hands?.kind === "card")
  .map((op) => op.name);

const handsSentence = (index: string): string | undefined =>
  index
    .split("\n")
    .find((line) => line.startsWith("Some things are the person's own to do"));

test("a desktop preamble names only the screens this Houston has", () => {
  expect(DESKTOP_UNSERVED).toHaveLength(65);
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
