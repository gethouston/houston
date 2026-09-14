import type {
  Acknowledgement,
  AssistantCatalog,
  ExtractionResult,
  UnroutableOperation,
} from "./assistant-catalog-types.ts";
import { acknowledgements } from "./assistant-gate.ts";
import { operationInventory } from "./assistant-operation-inventory.ts";
import { ASSISTANT_PROVENANCE } from "./assistant-paths.ts";

/**
 * The two documents a PERSON reads: whether every operation is reachable
 * (coverage) and what each one does to the user's data (operations). The
 * machine-read artifacts - the catalog, the capability index - are rendered
 * next door in ./assistant-render.ts.
 */

function section(title: string, values: string[]): string[] {
  return [
    `## ${title} (${values.length})`,
    "",
    ...(values.length > 0
      ? values.map((value) => `- \`${value}\``)
      : ["None."]),
  ];
}

function unroutableSection(values: UnroutableOperation[]): string[] {
  return [
    `## Unroutable operations (${values.length})`,
    "",
    "No HTTP route could be derived conservatively from the function body, so the operation is not callable.",
    "",
    ...(values.length > 0
      ? values.map(({ name, reason }) => `- \`${name}\`: ${reason}`)
      : ["None."]),
  ];
}

function acknowledgedSection(
  title: string,
  lead: string,
  values: Acknowledgement[],
): string[] {
  return [
    `## ${title} (${values.length})`,
    "",
    lead,
    "",
    ...(values.length > 0
      ? values.map(
          ({ name, kind, reason }) => `- \`${name}\` - ${kind}: ${reason}`,
        )
      : ["None."]),
  ];
}

export function renderCoverage({
  catalog,
  coverage,
  annotations,
}: ExtractionResult): string {
  const stated = acknowledgements(annotations);
  const debt = stated.filter((item) => item.debt);
  const exceptions = stated.filter((item) => !item.debt);
  const documented = catalog.operations.length - coverage.undocumented.length;
  const rawResponse = catalog.operations.filter(
    (operation) => operation.route?.rawResponse,
  ).length;
  return `${[
    `<!-- ${ASSISTANT_PROVENANCE} -->`,
    "# Houston assistant catalog coverage",
    "",
    `- Operations: ${catalog.operations.length}`,
    `- Documented: ${documented}`,
    `- Undocumented: ${coverage.undocumented.length}`,
    `- Ungrouped: ${coverage.ungrouped.length}`,
    `- Unschematized: ${coverage.unschematized.length}`,
    `- Hidden: ${coverage.hidden.length}`,
    `- Routable: ${catalog.operations.length - coverage.unroutable.length}`,
    `- Unroutable: ${coverage.unroutable.length}`,
    `- Raw-response routes: ${rawResponse}`,
    `- Acknowledged exceptions: ${exceptions.length}`,
    `- Acknowledged debt: ${debt.length}`,
    "",
    "A raw-response route reaches the host through an adapter function that post-processes the reply (unwrapping `items`, 404 fallbacks, `.then` transforms). The route itself carries the host's response unchanged.",
    "",
    ...acknowledgedSection(
      "Acknowledged exceptions",
      "Every operation the assistant cannot drive states why in its `@assistant` tag, and `pnpm check:assistant-coverage` fails the build on any that does not. These are the human-owned exceptions.",
      exceptions,
    ),
    "",
    ...acknowledgedSection(
      "Acknowledged debt",
      "Exceptions whose author says the operation SHOULD be automatable and is waiting on a refactor.",
      debt,
    ),
    "",
    ...section("Undocumented operations", coverage.undocumented),
    "",
    ...section("Ungrouped operations", coverage.ungrouped),
    "",
    ...section("Operations outside the group taxonomy", coverage.misgrouped),
    "",
    ...section("Unschematized fields", coverage.unschematized),
    "",
    ...section("Hidden operations", coverage.hidden),
    "",
    ...unroutableSection(coverage.unroutable),
    "",
    "Every operation's method, approval policy and parameter resolution: [assistant-operations.md](assistant-operations.md).",
  ].join("\n")}\n`;
}

/**
 * The per-operation ledger: what each operation does to the user's data, and
 * where every value it takes comes from. The coverage doc above judges whether
 * an operation is REACHABLE; this one is the policy an approver reads.
 */
export function renderOperations(catalog: AssistantCatalog): string {
  return `${[
    `<!-- ${ASSISTANT_PROVENANCE} -->`,
    "# Houston assistant operations",
    "",
    "One row per catalog operation. [Coverage exceptions, schema gaps and route diagnostics](assistant-coverage.md).",
    "",
    ...operationInventory(catalog),
  ].join("\n")}\n`;
}
