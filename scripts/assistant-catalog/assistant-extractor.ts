import { ASSISTANT_CATALOG_VERSION } from "@houston/domain/assistant-catalog-types";
import ts from "typescript";
import type { ExtractionResult } from "./assistant-catalog-types.ts";
import {
  type Collected,
  emptyCollection,
  type ReadOperation,
  readOperation,
  recordOperation,
  routeKey,
} from "./assistant-collect.ts";
import {
  type Declaration,
  type FileSurface,
  readFileSurface,
} from "./assistant-declarations.ts";
import { facadeSurface } from "./assistant-facade-surface.ts";
import type { Candidate } from "./assistant-module-surface.ts";
import { ASSISTANT_PROVENANCE } from "./assistant-paths.ts";
import type { RouteContext } from "./assistant-route.ts";
import { claimRoutes } from "./assistant-route-claims.ts";
import { hashSources, sharedHelpers } from "./assistant-sources.ts";

const CATALOG_FORMAT =
  "Every `path` is the FULL host path - nothing is prepended to it. A route carries its JSON body EITHER as `body` (one parameter sent whole) OR as `bodyFields` (body key -> parameter); a caller that reads only `body` sends an empty body for every `bodyFields` route. Each path parameter says how its value is escaped: `segment` is one URL segment, `path` keeps the `/` separators of a relative path. Every route returns the host response verbatim; `rawResponse: true` flags the ones whose adapter function additionally post-processes it (unwrapping `items`, 404 fallbacks, `.then` transforms), which a caller driving the route directly does not get. A parameter may also carry `description` (the author's `@param` line), `source` (the operation that LISTS the values it accepts), `resolver` (the app checks the value against that live list before it acts: pass the id, or the exact name the user said, and anything else comes back refused with the values that exist) and `unresolved` (why no live list backs this one). An identifier is never to be guessed: use the closed set in its `schema`, pass a name the app resolves, or call its `source` first.";

const CATALOG_COMMENT = `${ASSISTANT_PROVENANCE} ${CATALOG_FORMAT}`;

export interface ExtractOptions {
  operationSources: string[];
  isModuleSource: (path: string) => boolean;
  transportSource: string;
  facadeSource: string;
  resolverSources: string[];
}

export function extractCatalog(options: ExtractOptions): ExtractionResult {
  const files = [
    ...options.operationSources,
    options.transportSource,
    options.facadeSource,
    ...options.resolverSources,
  ];
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const load = (path: string): ts.SourceFile => {
    const source = program.getSourceFile(path);
    if (!source) throw new Error(`Could not load ${path}.`);
    return source;
  };
  const shared = sharedHelpers(load(options.transportSource));
  const hops = {
    checker,
    resolvers: new Set(
      options.resolverSources.map((path) => load(path).fileName),
    ),
  };
  const surfaces = new Map<string, FileSurface>();
  const factories = new Map<string, Candidate>();
  for (const path of options.operationSources) {
    const source = load(path);
    const surface = readFileSurface(source, options.isModuleSource(path));
    surfaces.set(source.fileName, surface);
    for (const factory of surface.factories)
      factories.set(factory.name, { node: factory.node, source });
  }
  const facade = facadeSurface(load(options.facadeSource), factories);

  const collected = emptyCollection();
  const seen = new Set<string>();
  const claimed = new Set<string>();
  const read = (
    declaration: Declaration,
    source: ts.SourceFile,
  ): ReadOperation | null => {
    if (seen.has(declaration.name)) return null;
    const context: RouteContext = {
      surface: surfaces.get(source.fileName) ?? readFileSurface(source, false),
      shared,
      hops,
    };
    const operation = readOperation(declaration, source, checker, context);
    if (operation) seen.add(declaration.name);
    return operation;
  };

  for (const path of options.operationSources) {
    const source = load(path);
    for (const declaration of surfaces.get(source.fileName)?.declarations ?? [])
      if (!facade.wiring.has(declaration.node)) {
        const operation = read(declaration, source);
        if (!operation) continue;
        const key = routeKey(operation.operation);
        if (key !== null) claimed.add(key);
        recordOperation(operation, collected);
      }
  }
  const sdk = facade.members.flatMap((member) => {
    const operation = read(
      {
        name: member.path,
        node: member.node,
        body: member.node.body ?? member.node,
        docs: member.docs,
        substitutions: member.substitutions,
      },
      member.source,
    );
    return operation ? [operation] : [];
  });
  const outcome = claimRoutes(sdk, claimed);
  for (const operation of outcome.published)
    recordOperation(operation, collected);
  for (const operation of outcome.shadowed)
    collected.annotations.push(operation.annotation);

  return finish(collected, files);
}

function finish(collected: Collected, files: string[]): ExtractionResult {
  const byGroupThenName = (
    left: { group?: string; name: string },
    right: { group?: string; name: string },
  ): number =>
    (left.group || "system").localeCompare(right.group || "system") ||
    left.name.localeCompare(right.name);
  collected.operations.sort(byGroupThenName);
  collected.annotations.sort(byGroupThenName);
  collected.unroutable.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return {
    catalog: {
      $comment: CATALOG_COMMENT,
      version: ASSISTANT_CATALOG_VERSION,
      sourceHash: hashSources(files),
      operations: collected.operations,
    },
    coverage: {
      undocumented: collected.undocumented,
      ungrouped: collected.ungrouped,
      misgrouped: collected.misgrouped,
      unschematized: collected.unschematized,
      hidden: collected.operations
        .filter((operation) => operation.hidden)
        .map((operation) => operation.name),
      unroutable: collected.unroutable,
    },
    annotations: collected.annotations,
  };
}
