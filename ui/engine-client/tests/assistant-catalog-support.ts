import { resolve } from "node:path";
import type {
  AssistantPathParam,
  AssistantRoute,
} from "../scripts/assistant-catalog-types.ts";
import { assistantPaths } from "../scripts/assistant-paths.ts";

const fixture = (name: string): string =>
  resolve(import.meta.dirname, "fixtures", name);

/** Precedence order matters: `assistant-dedup.ts` republishes `listThings`. */
export const fixtureOptions = {
  operationSources: [
    fixture("assistant-operations.ts"),
    fixture("assistant-cluster-mixin.ts"),
    fixture("assistant-dedup.ts"),
  ],
  transportSource: fixture("assistant-transport.ts"),
};

export const realOptions = {
  operationSources: assistantPaths.operationSources,
  transportSource: assistantPaths.transportSource,
};

/** An expected route, spelled as its difference from the plain GET default. */
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
