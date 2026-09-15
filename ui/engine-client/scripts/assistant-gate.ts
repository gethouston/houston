import type {
  Acknowledgement,
  OperationAnnotation,
} from "./assistant-catalog-types.ts";
import { violationsFor } from "./assistant-gate-rules.ts";

/**
 * The coverage gate: a user-facing adapter operation is either a properly
 * annotated, routable assistant tool, or it carries a written acknowledgement
 * of why it is not. Anything else fails the build - a silent `route: null` or a
 * bare `hidden` used to drop an operation out of automation with nobody
 * noticing.
 */
export type CoverageRule =
  | "unconfirmed-mutation"
  | "confirm-unstated"
  | "unresolved-identifier"
  | "unknown-tag"
  | "undocumented"
  | "ungrouped"
  | "misgrouped"
  | "unjustified-hidden"
  | "unroutable"
  | "stale-unroutable"
  | "route-conflict"
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

export function coverageViolations(
  annotations: readonly OperationAnnotation[],
): CoverageViolation[] {
  return annotations.flatMap((annotation) =>
    violationsFor(annotation).map((violation) => ({
      name: annotation.name,
      location: annotation.location,
      ...violation,
    })),
  );
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
