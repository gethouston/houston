import { createBurstGate } from "./error-burst";
import {
  type ForeignDomRescue,
  installForeignDomGuard,
  type NodeLike,
} from "./foreign-dom-guard";
import { captureQuietEvent } from "./sentry-quiet";

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

export function installForeignDomSafetyNet(): void {
  installForeignDomGuard(Node.prototype, reportForeignDomRescue);
}
