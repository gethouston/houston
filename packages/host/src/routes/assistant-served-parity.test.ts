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

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the embedded assistant catalog must load");
const catalog: AssistantCatalog = loaded;

const unserved = unservedOperations(catalog, listRoutes());

describe("the route registry and the probe tables agree", () => {
  test("every unserved operation is a declared cloud-only one", () => {
    const cloudOnly = new Set(
      CLOUD_ONLY_PROBES.map((probe) => probe.operation),
    );
    expect(unserved.filter((name) => !cloudOnly.has(name))).toEqual([]);
  });

  test("every declared cloud-only operation is unserved", () => {
    const missing = new Set(unserved);
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
