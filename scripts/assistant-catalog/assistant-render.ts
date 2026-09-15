import { renderAssistantCapabilityIndex } from "@houston/domain/assistant-capability-index-render";
import type { AssistantCatalog } from "./assistant-catalog-types.ts";
import { ASSISTANT_PROVENANCE } from "./assistant-paths.ts";

export function renderCatalog(catalog: AssistantCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

export function renderCapabilities(catalog: AssistantCatalog): string {
  const visible = catalog.operations.filter((operation) => !operation.hidden);
  const groups = [...new Set(visible.map((operation) => operation.group))];
  const lines = [
    `<!-- ${ASSISTANT_PROVENANCE} -->`,
    "# Houston assistant capabilities",
    "",
    "Everything the assistant can do in Houston, derived from the live client surface.",
    "",
    "Calling an operation returns the host's raw response. Where the adapter function also post-processes that response (unwrapping `items`, 404 fallbacks), the catalog records it as `rawResponse` and the post-processing is not applied.",
  ];
  for (const group of groups) {
    lines.push("", `## ${group}`, "");
    for (const operation of visible.filter((item) => item.group === group)) {
      lines.push(
        `- \`${operation.name}\`: ${operation.description}${operation.confirm ? " **Confirmation required.**" : ""}${operation.route ? "" : " (not callable yet)"}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The CAPABILITY INDEX the coordinator carries in its always-on context: one
 * line per group, naming every operation in it.
 *
 * It exists because a model that has to SEARCH before it knows a thing exists
 * will sometimes answer from memory instead, and answer wrong — Houston told a
 * user missions cannot be deleted while `deleteActivity` sat in the catalog,
 * visible. Names only, so the whole surface fits in a paragraph and the model
 * always knows what to reach for; the contract of any one of them is still read
 * with `houston_describe`.
 *
 * It lists exactly what `houston_call` will PERFORM, never merely what is
 * visible: an operation the generator could not route is refused as
 * `operation_not_supported`, and advertising one in the always-on context is
 * how the agent comes to promise a user an action this build cannot do. A
 * group every one of whose operations is unroutable drops out entirely.
 *
 * Emitted as a TypeScript module in DOMAIN rather than a document: the runtime
 * builds the coordinator's prompt from it, so it must travel inside the bundle
 * (the container image and the Bun-compiled desktop sidecar alike) with nothing
 * to locate on disk. Regenerated with the catalog and drift-gated by
 * `pnpm check:assistant-catalog`, so a new operation reaches the assistant's
 * context the moment it is annotated.
 *
 * The TEXT itself is written by {@link renderAssistantCapabilityIndex} in
 * domain, because the runtime renders it a second time over the operations
 * this deployment actually serves. This module contributes the module wrapper
 * and nothing else: two copies of the wording would drift, and the drift would
 * read to the model as two different Houstons.
 */
export function renderCapabilityIndex(catalog: AssistantCatalog): string {
  const index = renderAssistantCapabilityIndex(catalog.operations);
  return `${[
    `// ${ASSISTANT_PROVENANCE}`,
    "",
    "/**",
    " * The coordinator's map of everything it can do in Houston: one line per",
    " * catalog group, naming the operations in it. Injected into the personal",
    " * assistant's always-on context beside its operating rules",
    " * (packages/runtime/src/session/assistant-rules-context.ts), so the model",
    " * knows the surface exists without having to search for it first.",
    " */",
    `export const ASSISTANT_CAPABILITY_INDEX = ${JSON.stringify(index)};`,
  ].join("\n")}\n`;
}
