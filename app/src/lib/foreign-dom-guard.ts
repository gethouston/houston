/**
 * Keeps React's commit phase alive when something outside React rewrites the
 * DOM under it. Browser page translation (Chrome, Safari, Edge, translating
 * extensions) wraps every text node in `<font><font>…</font></font>`; React
 * then calls `parent.removeChild(text)` or `parent.insertBefore(node, text)`
 * on a text node that is no longer a direct child, the browser throws
 * NotFoundError ("Failed to execute 'removeChild' on 'Node'" on Blink, "The
 * object can not be found here." on WebKit), and the top-level error boundary
 * replaces the whole screen with the crash card (HOUSTON-APP-590/55V/5CA).
 * The document opts out of translation (`<html translate="no">`, both
 * index.html files); this is the safety net for anything that ignores it.
 *
 * Both DOM methods are re-pointed at the WRAPPER: the ancestor of the target
 * that is a direct child of the parent. Removing the wrapper takes the
 * translation and the original text with it; inserting before the wrapper
 * lands the node where React meant it. React only relies on the tree's shape
 * at the element level, and that shape is preserved. A target that is not
 * inside the parent at all is treated as already removed, or appended, never
 * thrown on: a wrong order beats a lost screen. Every rescue is reported
 * through `onRescue` (silent to the user, never silent to us).
 *
 * Dependency-free so the resolution and the patch are node-testable against a
 * fake prototype (app/tests/foreign-dom-guard.test.ts).
 */

export interface NodeLike {
  parentNode: NodeLike | null;
}

/**
 * The ancestor of `node` that is a direct child of `parent` (`node` itself
 * when it already is one); null when `node` is not inside `parent` at all.
 */
export function directChildOf<N extends NodeLike>(
  parent: N,
  node: N,
): N | null {
  let current: N | null = node;
  while (current && current.parentNode !== parent) {
    current = current.parentNode as N | null;
  }
  return current;
}

export type ForeignDomOp = "removeChild" | "insertBefore";

export interface ForeignDomRescue {
  op: ForeignDomOp;
  /** The node the call was addressed at. */
  parent: NodeLike;
  /** The child (removeChild) or reference (insertBefore) React expected to be a direct child. */
  target: NodeLike;
  /** The direct child the call was re-pointed at; null when `target` was not inside `parent`. */
  wrapper: NodeLike | null;
}

export type DomMethods = Pick<Node, "removeChild" | "insertBefore">;

/**
 * Patch `proto` (the live `Node.prototype` in a browser) in place. Calls that
 * address a genuine direct child go straight to the original method, so the
 * fast path costs one property read.
 */
export function installForeignDomGuard(
  proto: DomMethods,
  onRescue: (rescue: ForeignDomRescue) => void,
): void {
  const { removeChild, insertBefore } = proto;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode === this) {
      return removeChild.call(this, child) as T;
    }
    const wrapper = directChildOf<NodeLike>(this, child);
    onRescue({ op: "removeChild", parent: this, target: child, wrapper });
    if (wrapper) removeChild.call(this, wrapper as Node);
    return child;
  };
  proto.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference === null || reference.parentNode === this) {
      return insertBefore.call(this, node, reference) as T;
    }
    const wrapper = directChildOf<NodeLike>(this, reference);
    onRescue({ op: "insertBefore", parent: this, target: reference, wrapper });
    return insertBefore.call(this, node, wrapper as Node | null) as T;
  };
}
