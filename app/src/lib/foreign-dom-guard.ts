export interface NodeLike {
  parentNode: NodeLike | null;
}

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
  parent: NodeLike;
  target: NodeLike;
  wrapper: NodeLike | null;
}

export type DomMethods = Pick<Node, "removeChild" | "insertBefore">;

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
