import type { AssistantHands } from "@houston/domain/assistant-hands";
import type {
  Acknowledgement,
  AssistantCatalog,
  ExtractionResult,
  OperationAnnotation,
  UnroutableOperation,
} from "./assistant-catalog-types.ts";
import { acknowledgements } from "./assistant-gate.ts";
import { operationInventory } from "./assistant-operation-inventory.ts";
import { ASSISTANT_PROVENANCE } from "./assistant-paths.ts";

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

function confirmedSection(
  annotations: readonly OperationAnnotation[],
): string[] {
  const confirmed = annotations.filter((item) => item.confirm);
  return [
    `## Confirmed operations (${confirmed.length})`,
    "",
    "Each one ends the agent's turn and asks the user before it runs, and states what they lose if the call is wrong. `pnpm check:assistant-coverage` fails a `confirm` that states nothing.",
    "",
    ...(confirmed.length > 0
      ? confirmed.map(
          ({ name, confirmed: reason }) =>
            `- \`${name}\`: ${reason ?? "no reason stated."}`,
        )
      : ["None."]),
  ];
}

function handsSection(catalog: AssistantCatalog): string[] {
  const named = catalog.operations.flatMap(({ name, hands }) =>
    hands ? [{ name, hands }] : [],
  );
  const card = (hands: AssistantHands): string =>
    hands.kind === "unreachable"
      ? `no card: ${hands.reason}`
      : `\`${hands.tool}${hands.surface ? `(${hands.surface})` : ""}\``;
  return [
    `## Hands-on operations (${named.length})`,
    "",
    "Each one is withheld from the assistant and still the person's to finish. The card names the Houston flow that hands it to them; `no card` states why the errand does not exist.",
    "",
    ...(named.length > 0
      ? named.map(({ name, hands }) => `- \`${name}\` - ${card(hands)}`)
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
    `- Confirmed: ${annotations.filter((item) => item.confirm).length}`,
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
    ...confirmedSection(annotations),
    "",
    ...handsSection(catalog),
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
