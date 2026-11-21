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
