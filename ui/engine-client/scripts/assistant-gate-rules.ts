import {
  ASSISTANT_GROUPS,
  type OperationAnnotation,
} from "./assistant-catalog-types.ts";
import type { CoverageViolation } from "./assistant-gate.ts";

/** One rule's verdict, before the operation it belongs to is stamped on it. */
type Finding = Omit<CoverageViolation, "name" | "location">;

function groupViolations(annotation: OperationAnnotation): Finding[] {
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

function reachViolations(annotation: OperationAnnotation): Finding[] {
  // A hidden operation is not automated at all, so how it would have been
  // routed, typed or confirmed is moot - but ONLY once hiding itself is
  // justified. Its own reason is the statement; a second one restating it
  // would be noise the next author copies.
  const found: Finding[] = [];
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
      fix: "add `@assistant confirm: <what the person loses if it goes wrong>` (the user answers a card first) or `@assistant unconfirmed: <why this one needs no approval>`.",
    });
  // The other half of the same decision. Every card ends the agent's turn and
  // asks the person a question, so a `confirm` nobody justified is how the
  // surface drifts into asking about everything - and a person who is asked
  // about everything stops reading the cards that matter.
  if (annotation.confirm && !annotation.confirmed?.trim())
    found.push({
      rule: "confirm-unstated",
      problem:
        "the caller must confirm it, and nothing says what the person is being protected from.",
      fix: "add the reason to the tag - `@assistant confirm: <what the person loses if this call goes wrong>`.",
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

/**
 * An exception that no longer applies. Judged OUTSIDE reachViolations, so a
 * hidden operation is not exempt: the whole point of a written acknowledgement
 * is that it stops being written the day the thing it excuses is fixed, and a
 * stale one tells the next reader a refactor is still owed when it has landed.
 */
function staleExceptions(annotation: OperationAnnotation): Finding[] {
  return annotation.routable && annotation.unroutableReason
    ? [
        {
          rule: "stale-unroutable" as const,
          problem: `a route IS derived now, and \`unroutable: ${annotation.unroutableReason}\` still says none can be.`,
          fix: "delete the `@assistant unroutable:` tag; the route the generator derived is in the catalog.",
        },
      ]
    : [];
}

/** Everything wrong with ONE operation, rule by rule, in report order. */
export function violationsFor(annotation: OperationAnnotation): Finding[] {
  return [
    ...annotation.unknownTags.map(
      (tag): Finding => ({
        rule: "unknown-tag",
        problem: `\`@assistant ${tag}\` is not a tag the grammar defines.`,
        fix: "use `group:<slug>`, `confirm: <reason>`, `unconfirmed: <reason>`, `hidden: <reason>`, `unroutable: <reason>`, or `unschematized: <reason>`.",
      }),
    ),
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
    // Outside reachViolations on purpose: a hidden operation is exempt from how
    // it would have been routed, but NOT from an undecidable claim on a route -
    // two hidden twins leave the catalog's entry for that route up to source
    // order, which is exactly what this rule exists to refuse.
    ...(annotation.routeConflict
      ? [
          {
            rule: "route-conflict" as const,
            problem: `\`${annotation.routeConflict.route}\` is claimed by this and by ${annotation.routeConflict.others.join(", ")}, and visibility does not settle which one the catalog publishes.`,
            fix: "leave exactly ONE of them visible - add `@assistant hidden: <why the assistant must not call this>` to every other claimant - or give them distinct routes.",
          },
        ]
      : []),
    ...(annotation.hidden && !annotation.hiddenReason
      ? [
          {
            rule: "unjustified-hidden" as const,
            problem: "`hidden` with no reason.",
            fix: "write `@assistant hidden: <why the assistant must not call this>` - a bare `hidden` drops an operation out of automation with no rationale.",
          },
        ]
      : []),
    ...staleExceptions(annotation),
    ...reachViolations(annotation),
  ];
}
