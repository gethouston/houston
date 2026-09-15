import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { renderAssistantCapabilityIndex } from "@houston/domain/assistant-capability-index-render";
import { describe, expect, test } from "vitest";
import type { AssistantCatalog } from "../assistant/catalog";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { unservedOperations } from "../assistant/served-operations";
import { CLOUD_ONLY_PROBES } from "./assistant-parity-cloud-probes";
import { LOCAL_PROBES } from "./assistant-parity-local-probes";
import { WRITE_DRIVEN_OPERATIONS } from "./assistant-parity-probes";
import { listRoutes } from "./registry/all";

/**
 * THE PIN: what the route registry says this host cannot perform is exactly
 * what the parity suite drives against a real host and finds missing.
 *
 * The two answers are reached by completely different means — this one reads
 * the declaration table, `assistant-parity.test.ts` boots a host and gets a
 * 404 — so agreeing is evidence, not tautology. It matters because the
 * registry's answer is the one that reaches a user: it is what the host stamps
 * into the coordinator's environment, and therefore what the AI Manager on a
 * desktop believes about itself.
 *
 * A failure here is one of two things, and the direction says which. A name
 * the registry calls unserved that no probe table calls cloud-only means a
 * route moved and the catalog now addresses nothing; a cloud-only probe the
 * registry thinks is served means a path started resolving locally and the
 * reason in `assistant-parity-cloud-probes.ts` is stale.
 */

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the embedded assistant catalog must load");
const catalog: AssistantCatalog = loaded;

const unserved = unservedOperations(catalog, listRoutes());

describe("the route registry and the probe tables agree", () => {
  test("every unserved operation is a declared cloud-only one", () => {
    const cloudOnly = new Set(
      CLOUD_ONLY_PROBES.map((probe) => probe.operation),
    );
    // Add the name to CLOUD_ONLY_PROBES with the reason this host may miss it,
    // or restore the route the catalog says it calls.
    expect(unserved.filter((name) => !cloudOnly.has(name))).toEqual([]);
  });

  test("every declared cloud-only operation is unserved", () => {
    const missing = new Set(unserved);
    // A cloud-only probe whose address now resolves locally: either the host
    // grew the route (move the probe to LOCAL_PROBES) or a wider pattern
    // started swallowing it.
    expect(
      CLOUD_ONLY_PROBES.map((probe) => probe.operation).filter(
        (name) => !missing.has(name),
      ),
    ).toEqual([]);
  });

  test("nothing the host is probed for is called unserved", () => {
    const served = new Set(unserved);
    expect(
      [
        ...LOCAL_PROBES.map((probe) => probe.operation),
        ...WRITE_DRIVEN_OPERATIONS,
      ].filter((name) => served.has(name)),
    ).toEqual([]);
  });
});

/**
 * The operations one rendered index actually LISTS. Read out of the group
 * lines rather than by substring: `removeAgentCustomIntegration` contains
 * `moveAgent`, so `toContain` would report a cloud-only operation as present
 * in an index that never named it.
 */
function indexNames(index: string): Set<string> {
  const names = index
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .flatMap((line) => (line.split(": ")[1] ?? "").split(", "));
  return new Set(names);
}

describe("the capability index follows what is served", () => {
  const all = catalog.operations;
  const local = all.filter((op) => !unserved.includes(op.name));

  test("the unfiltered index is byte-identical to the generated one", () => {
    expect(renderAssistantCapabilityIndex(all)).toBe(
      ASSISTANT_CAPABILITY_INDEX,
    );
  });

  test("the full index names every cloud-only operation that is callable", () => {
    const listed = indexNames(renderAssistantCapabilityIndex(all));
    const callableCloudOnly = CLOUD_ONLY_PROBES.map(
      (probe) => probe.operation,
    ).filter((name) =>
      all.some((op) => op.name === name && !op.hidden && op.route !== null),
    );
    expect(callableCloudOnly.length).toBeGreaterThan(0);
    expect(callableCloudOnly.filter((name) => !listed.has(name))).toEqual([]);
  });

  test("the local index names none of them", () => {
    const listed = indexNames(renderAssistantCapabilityIndex(local));
    expect(unserved.filter((name) => listed.has(name))).toEqual([]);
  });
});
