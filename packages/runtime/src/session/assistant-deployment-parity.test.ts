import {
  ASSISTANT_UNSERVED_ENV,
  readUnservedOperations,
} from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { runtimeSpawnEnv } from "@houston/host/src/launcher/runtime-env";
import { expect, test } from "vitest";

/**
 * THE HANDSHAKE that tells a coordinator what its own Houston cannot do: the
 * host STAMPS the list when it spawns, this process READS it at boot. Pinned
 * the way the role handshake is (`assistant-role-parity.test.ts`), because the
 * two failure modes are opposite and both silent — a stamp the runtime cannot
 * parse leaves the assistant offering operations that will 404, and a name
 * mangled in transit withdraws one that works.
 */

const names = (env: Record<string, string>) => [...readUnservedOperations(env)];

test("what the host stamps is what the runtime reads back", () => {
  const stamped = runtimeSpawnEnv({
    transcriptDualWrite: false,
    assistantRole: "coordinator",
    unservedOperations: ["getOrg", "listOrgs"],
  });
  expect(names(stamped)).toEqual(["getOrg", "listOrgs"]);
});

test("only the coordinator is told - no other runtime can act on it", () => {
  const plain = runtimeSpawnEnv({
    transcriptDualWrite: false,
    assistantRole: null,
    unservedOperations: ["getOrg"],
  });
  expect(plain).not.toHaveProperty(ASSISTANT_UNSERVED_ENV);
  expect(names(plain)).toEqual([]);
});

test("a host that withholds nothing stamps nothing", () => {
  expect(
    runtimeSpawnEnv({
      transcriptDualWrite: false,
      assistantRole: "coordinator",
      unservedOperations: [],
    }),
  ).not.toHaveProperty(ASSISTANT_UNSERVED_ENV);
});

test("a missing, empty or blank variable withholds nothing - it fails OPEN", () => {
  expect(names({})).toEqual([]);
  expect(names({ [ASSISTANT_UNSERVED_ENV]: "" })).toEqual([]);
  expect(names({ [ASSISTANT_UNSERVED_ENV]: "   " })).toEqual([]);
  expect(names({ [ASSISTANT_UNSERVED_ENV]: ",,," })).toEqual([]);
});

test("every catalog name survives the comma encoding, unescaped", () => {
  const catalog = processAssistantCatalog();
  if (!catalog) throw new Error("the embedded assistant catalog must load");
  const all = catalog.operations.map((op) => op.name);
  // The encoding carries no escape, which is only safe because no name holds a
  // comma or whitespace. Asserted rather than assumed: the day one does, this
  // fails instead of silently splitting an operation in half.
  expect(all.filter((name) => !/^[A-Za-z0-9.]+$/.test(name))).toEqual([]);
  expect(
    names(
      runtimeSpawnEnv({
        transcriptDualWrite: false,
        assistantRole: "coordinator",
        unservedOperations: all,
      }),
    ),
  ).toEqual(all);
});
