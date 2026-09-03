import { createBurstGate } from "./error-burst";
import {
  type ForeignDomRescue,
  installForeignDomGuard,
  type NodeLike,
} from "./foreign-dom-guard";
import { captureQuietEvent } from "./sentry-quiet";

/**
 * The reporting half of the foreign-DOM guard: a rescue is invisible to the
 * user by design (the screen simply keeps working), so it must still reach
 * us. One line in the frontend log and ONE warning-level Sentry event per
 * burst, in a single fingerprinted issue: a translated page rescues on every
 * commit, and counting each would only inflate the issue against the quota.
 * No node content rides along, only tag names: the text under a rescued
 * wrapper is whatever the user was reading.
 */
const rescueBurst = createBurstGate();

function describeNode(node: NodeLike): string {
  const dom = node as Partial<Node>;
  if (typeof dom.nodeName !== "string") return "?";
  return dom.nodeName.toLowerCase();
}

function reportForeignDomRescue(rescue: ForeignDomRescue): void {
  const parent = describeNode(rescue.parent);
  const target = describeNode(rescue.target);
  const wrapper = rescue.wrapper ? describeNode(rescue.wrapper) : "none";
  if (!rescueBurst.isFirst(`${rescue.op}:${parent}:${wrapper}`, Date.now())) {
    return;
  }
  const message = `${rescue.op} re-pointed: ${target} is no longer a direct child of ${parent} (wrapper: ${wrapper})`;
  console.warn(`[foreign-dom] ${message}`);
  const error = new Error(message);
  error.name = "ForeignDomRescue";
  captureQuietEvent(error, {
    level: "warning",
    fingerprint: ["foreign_dom_rescue"],
    tags: {
      source: "foreign_dom_guard",
      dom_op: rescue.op,
      dom_wrapper: wrapper,
      document_translate: document.documentElement.translate ? "yes" : "no",
    },
    extra: { parent, target, wrapper, lang: document.documentElement.lang },
  });
}

/** Install the guard on the live DOM with reporting wired. Call once at boot. */
export function installForeignDomSafetyNet(): void {
  installForeignDomGuard(Node.prototype, reportForeignDomRescue);
}
