import { resolve } from "node:path";
import type {
  AssistantPathParam,
  AssistantRoute,
  OperationAnnotation,
} from "../assistant-catalog-types.ts";
import { assistantPaths } from "../assistant-paths.ts";

const fixture = (name: string): string =>
  resolve(import.meta.dirname, "fixtures", name);

export const fixtureOptions = {
  operationSources: [
    fixture("assistant-operations.ts"),
    fixture("assistant-cluster-mixin.ts"),
    fixture("assistant-dedup.ts"),
    fixture("assistant-module.ts"),
    fixture("assistant-claims-module.ts"),
  ],
  isModuleSource: (path: string): boolean =>
    /assistant-(claims-)?module\.ts$/.test(path),
  transportSource: fixture("assistant-transport.ts"),
  facadeSource: fixture("assistant-facade.ts"),
  resolverSources: [fixture("assistant-runtime-client.ts")],
};

export const realOptions = {
  operationSources: assistantPaths.operationSources,
  isModuleSource: assistantPaths.isModuleSource,
  transportSource: assistantPaths.transportSource,
  facadeSource: assistantPaths.facadeSource,
  resolverSources: assistantPaths.resolverSources,
};

export const route = (path: string, extra: Partial<AssistantRoute> = {}) => ({
  method: "GET",
  path,
  pathParams: [],
  query: {},
  body: null,
  bodyFields: null,
  rawResponse: false,
  ...extra,
});

export const segments = (...names: string[]): AssistantPathParam[] =>
  names.map((name) => ({ name, encoding: "segment" }));

export const annotation = (
  overrides: Partial<OperationAnnotation> = {},
): OperationAnnotation => ({
  name: "listThings",
  location: "packages/engine-adapter/cp/things.ts:12",
  documented: true,
  group: "agents",
  hidden: false,
  confirm: false,
  method: "GET",
  openIdentifiers: [],
  unknownTags: [],
  routable: true,
  unschematizedFields: [],
  ...overrides,
});
