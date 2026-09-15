import {
  ASSISTANT_HANDS_TOOLS,
  parseAssistantHands,
} from "@houston/domain/assistant-hands";
import { HANDS_ON_SURFACES } from "@houston/protocol/interaction-types";
import type { OperationAnnotation } from "./assistant-catalog-types.ts";
import type { CoverageViolation } from "./assistant-gate.ts";

/**
 * Whether a withheld operation leaves the PERSON'S errand unfinished, and what
 * they are handed instead.
 *
 * `hidden:` says the assistant must not make the call. It says nothing about
 * whether the thing still needs doing — and for most of what is withheld here
 * it plainly does: a key gets pasted, a card gets added, a file leaves the
 * device. Left at that, the model learns only the refusal, and a model that
 * knows only the refusal tells the user Houston cannot do it.
 *
 * So the class is decided STRUCTURALLY and the author answers in writing: a
 * card that reaches it, or a stated reason none does. No prose regex over the
 * hidden reason, no committed list of names — either would go stale the first
 * time an operation moved group, silently and with nothing failing.
 */

type Finding = Omit<CoverageViolation, "name" | "location">;

/**
 * Where a hidden operation is usually one the PERSON can still finish through a
 * card. "writes" = mutations only; "all" = every hidden operation in the group,
 * because a file operation moves bytes no chat turn can carry whatever its verb.
 */
const NEEDS_HANDS_GROUPS: ReadonlyMap<string, "writes" | "all"> = new Map([
  ["integrations", "writes"],
  ["providers", "writes"],
  ["billing", "writes"],
  ["api-keys", "writes"],
  ["routines", "writes"],
  ["spaces", "writes"],
  ["files", "all"],
]);

const CARDS = [
  `\`request_hands_on(<one of ${HANDS_ON_SURFACES.join(", ")}>)\``,
  ...ASSISTANT_HANDS_TOOLS.filter((tool) => tool !== "request_hands_on").map(
    (tool) => `\`${tool}\``,
  ),
].join(", ");

const NAME_A_CARD = `name the card that DOES reach it - \`@assistant hands: \` with one of ${CARDS} - or state \`@assistant hands: unreachable <why no card reaches this either>\`.`;

/**
 * True when this operation's own removal from the assistant leaves an errand
 * behind. A mutation is a DERIVED non-GET method: an operation the generator
 * could not route is not dispatchable at all, and the gate already refuses that
 * silently going unstated (`unroutable`), so it is not judged twice here.
 */
function needsHands(annotation: OperationAnnotation): boolean {
  const mode = NEEDS_HANDS_GROUPS.get(annotation.group ?? "");
  if (!mode) return false;
  return (
    mode === "all" ||
    (annotation.method !== undefined && annotation.method !== "GET")
  );
}

export function handsViolations(annotation: OperationAnnotation): Finding[] {
  const card = annotation.handsCard?.trim();
  if (!card)
    return annotation.hidden && needsHands(annotation)
      ? [
          {
            rule: "hands-missing",
            problem: `withheld from the assistant, and nothing says how the person still gets it done.`,
            fix: NAME_A_CARD,
          },
        ]
      : [];
  if (!annotation.hidden)
    return [
      {
        rule: "hands-unhidden",
        problem:
          "`hands:` on an operation the assistant may simply perform, so the card is a detour around a call it is allowed to make.",
        fix: "delete the `@assistant hands:` tag, or add `@assistant hidden: <why the assistant must not call this>` if the call really is the person's own.",
      },
    ];
  const parsed = parseAssistantHands(card);
  return parsed.kind === "invalid"
    ? [
        {
          rule: "hands-unknown",
          problem: parsed.problem,
          fix: NAME_A_CARD,
        },
      ]
    : [];
}
