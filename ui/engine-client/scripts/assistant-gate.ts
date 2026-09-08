import {
  type Acknowledgement,
  ASSISTANT_GROUPS,
  type OperationAnnotation,
} from "./assistant-catalog-types.ts";

/**
 * The coverage gate: a user-facing adapter operation is either a properly
 * annotated, routable assistant tool, or it carries a written acknowledgement
 * of why it is not. Anything else fails the build - a silent `route: null` or a
 * bare `hidden` used to drop an operation out of automation with nobody
 * noticing.
 */
export type CoverageRule =
  | "unconfirmed-mutation"
  | "unresolved-identifier"
  | "unknown-tag"
  | "undocumented"
  | "ungrouped"
  | "misgrouped"
  | "unjustified-hidden"
  | "unroutable"
  | "unschematized";

export interface CoverageViolation {
  name: string;
  location: string;
  rule: CoverageRule;
  /** What is wrong, in one sentence. */
  problem: string;
  /** The exact edit that clears it. */
  fix: string;
}

const DEBT = /^debt:\s*/i;

export function acknowledgementOf(
  name: string,
  kind: Acknowledgement["kind"],
  reason: string,
): Acknowledgement {
  return {
    name,
    kind,
    reason: reason.replace(DEBT, ""),
    debt: DEBT.test(reason),
  };
}

/** Every stated exception, operation by operation, in catalog order. */
export function acknowledgements(
  annotations: readonly OperationAnnotation[],
): Acknowledgement[] {
  const found: Acknowledgement[] = [];
  for (const annotation of annotations) {
    const stated = [
      ["hidden", annotation.hiddenReason],
      ["unconfirmed", annotation.unconfirmed],
      ["unroutable", annotation.unroutableReason],
      ["unschematized", annotation.unschematizedReason],
    ] as const;
    for (const [kind, reason] of stated)
      if (reason) found.push(acknowledgementOf(annotation.name, kind, reason));
  }
  return found;
}

function groupViolations(
  annotation: OperationAnnotation,
): Omit<CoverageViolation, "name" | "location">[] {
  if (annotation.group === undefined || annotation.group === "")
    return [
      {
        rule: "ungrouped",
        problem: "no group declared.",
        fix: `add \`@assistant group:<one of ${ASSISTANT_GROUPS.join(", ")}>\`.`,
      },
    ];
  if (!ASSISTANT_GROUPS.includes(annotation.group))
    return [
      {
        rule: "misgrouped",
        problem: `group \`${annotation.group}\` is outside the taxonomy.`,
        fix: `use one of: ${ASSISTANT_GROUPS.join(", ")}.`,
      },
    ];
  return [];
}

function reachViolations(
  annotation: OperationAnnotation,
): Omit<CoverageViolation, "name" | "location">[] {
  // A hidden operation is not automated at all, so how it would have been
  // routed, typed or confirmed is moot - but ONLY once hiding itself is
  // justified. Its own reason is the statement; a second one restating it
  // would be noise the next author copies.
  const found: Omit<CoverageViolation, "name" | "location">[] = [];
  if (annotation.hidden && annotation.hiddenReason) return found;
  if (
    annotation.method &&
    annotation.method !== "GET" &&
    !annotation.confirm &&
    !annotation.unconfirmed?.trim()
  )
    found.push({
      rule: "unconfirmed-mutation",
      problem: `${annotation.method} changes something and dispatches with no approval card and no authored reason.`,
      fix: "add `@assistant confirm` (the user answers a card first) or `@assistant unconfirmed: <why this one needs no approval>`.",
    });
  if (annotation.openIdentifiers.length > 0)
    found.push({
      rule: "unresolved-identifier",
      problem: `${annotation.openIdentifiers.join(", ")} name something that already exists, and nothing says which values are accepted.`,
      fix: "add the collection to ui/engine-client/scripts/assistant-entity-rules.ts: a `collection` the host resolves the value against live, or an `unlisted` reason naming the operation that lists it.",
    });
  if (!annotation.routable && !annotation.unroutableReason)
    found.push({
      rule: "unroutable",
      problem: "no route could be derived, and nothing says why.",
      fix: "add `@assistant unroutable: <why this cannot be auto-routed>` (prefix the reason with `debt:` if it should be routable and needs a refactor).",
    });
  if (
    annotation.unschematizedFields.length > 0 &&
    !annotation.unschematizedReason
  )
    found.push({
      rule: "unschematized",
      problem: `free-form schema on ${annotation.unschematizedFields.join(", ")}.`,
      fix: "add `@assistant unschematized: <why the shape cannot be typed>` (prefix the reason with `debt:` if it should be typed and needs a refactor).",
    });
  return found;
}

export function coverageViolations(
  annotations: readonly OperationAnnotation[],
): CoverageViolation[] {
  const violations: CoverageViolation[] = [];
  for (const annotation of annotations) {
    const found: Omit<CoverageViolation, "name" | "location">[] = [
      ...annotation.unknownTags.map((tag) => ({
        rule: "unknown-tag" as const,
        problem: `\`@assistant ${tag}\` is not a tag the grammar defines.`,
        fix: "use `group:<slug>`, `confirm`, `unconfirmed: <reason>`, `hidden: <reason>`, `unroutable: <reason>`, or `unschematized: <reason>`.",
      })),
      ...(annotation.documented
        ? []
        : [
            {
              rule: "undocumented" as const,
              problem: "no description.",
              fix: "open the JSDoc with a sentence saying what the operation does, in the words a user would use.",
            },
          ]),
      ...groupViolations(annotation),
      ...(annotation.hidden && !annotation.hiddenReason
        ? [
            {
              rule: "unjustified-hidden" as const,
              problem: "`hidden` with no reason.",
              fix: "write `@assistant hidden: <why the assistant must not call this>` - a bare `hidden` drops an operation out of automation with no rationale.",
            },
          ]
        : []),
      ...reachViolations(annotation),
    ];
    for (const violation of found)
      violations.push({
        name: annotation.name,
        location: annotation.location,
        ...violation,
      });
  }
  return violations;
}

export function formatViolations(
  violations: readonly CoverageViolation[],
): string {
  const lines = [
    `Assistant coverage gate: ${violations.length} problem${violations.length === 1 ? "" : "s"} across the adapter surface.`,
    "",
  ];
  for (const violation of violations) {
    lines.push(
      `  ${violation.name} - ${violation.location}`,
      `    ${violation.rule}: ${violation.problem}`,
      `    fix: ${violation.fix}`,
      "",
    );
  }
  lines.push(
    "Every user-facing adapter operation is a routable assistant tool or says why it is not.",
    "Tag grammar: ui/engine-client/scripts/assistant-jsdoc.ts - exceptions: ui/engine-client/generated/assistant-coverage.md",
  );
  return `${lines.join("\n")}\n`;
}
