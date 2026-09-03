import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import {
  directChildOf,
  type ForeignDomRescue,
  installForeignDomGuard,
} from "../src/lib/foreign-dom-guard.ts";

// A browser translator wraps text nodes in <font><font> under React's feet;
// React's next removeChild/insertBefore on the text node must land on the
// wrapper instead of throwing NotFoundError (HOUSTON-APP-590/55V/5CA).

/** The DOM's own contract, minus everything the guard does not touch. */
class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  readonly nodeName: string;
  constructor(nodeName: string) {
    this.nodeName = nodeName;
  }
  appendChild(child: FakeNode): FakeNode {
    child.parentNode?.detach(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  detach(child: FakeNode): void {
    this.childNodes = this.childNodes.filter((c) => c !== child);
    child.parentNode = null;
  }
}

/** Prototype with the strict browser semantics the guard wraps. */
function strictProto() {
  return {
    removeChild(this: FakeNode, child: FakeNode): FakeNode {
      if (child.parentNode !== this) throw new Error("NotFoundError");
      this.detach(child);
      return child;
    },
    insertBefore(
      this: FakeNode,
      node: FakeNode,
      reference: FakeNode | null,
    ): FakeNode {
      if (reference === null) return this.appendChild(node);
      if (reference.parentNode !== this) throw new Error("NotFoundError");
      node.parentNode?.detach(node);
      node.parentNode = this;
      this.childNodes.splice(this.childNodes.indexOf(reference), 0, node);
      return node;
    },
  };
}

type Proto = ReturnType<typeof strictProto>;
const asDom = (proto: Proto) =>
  proto as unknown as Parameters<typeof installForeignDomGuard>[0];

/** <p>text</p> after translation: <p><font><font>text</font></font></p>. */
function translated() {
  const p = new FakeNode("p");
  const text = new FakeNode("#text");
  const outer = new FakeNode("font");
  const inner = new FakeNode("font");
  p.appendChild(outer);
  outer.appendChild(inner);
  inner.appendChild(text);
  return { p, text, outer };
}

describe("directChildOf", () => {
  it("resolves the wrapper a translator put between parent and text", () => {
    const { p, text, outer } = translated();
    strictEqual(directChildOf(p, text), outer);
  });
  it("is the node itself when it is already a direct child", () => {
    const p = new FakeNode("p");
    const text = p.appendChild(new FakeNode("#text"));
    strictEqual(directChildOf(p, text), text);
  });
  it("is null when the node is not inside the parent at all", () => {
    const { p, text } = translated();
    strictEqual(directChildOf(new FakeNode("div"), text), null);
    const detached = new FakeNode("#text");
    strictEqual(directChildOf(p, detached), null);
  });
});

describe("installForeignDomGuard", () => {
  it("leaves direct-child calls on the original methods, no rescue", () => {
    const proto = strictProto();
    const rescues: ForeignDomRescue[] = [];
    installForeignDomGuard(asDom(proto), (r) => rescues.push(r));
    const p = new FakeNode("p");
    const a = p.appendChild(new FakeNode("#text"));
    const b = new FakeNode("span");
    proto.insertBefore.call(p, b, a);
    deepStrictEqual(p.childNodes, [b, a]);
    proto.removeChild.call(p, a);
    deepStrictEqual(p.childNodes, [b]);
    deepStrictEqual(rescues, []);
  });

  it("removes the wrapper when React removes a wrapped text node", () => {
    const proto = strictProto();
    const rescues: ForeignDomRescue[] = [];
    installForeignDomGuard(asDom(proto), (r) => rescues.push(r));
    const { p, text, outer } = translated();
    strictEqual(proto.removeChild.call(p, text), text);
    deepStrictEqual(p.childNodes, []);
    strictEqual(rescues.length, 1);
    deepStrictEqual(rescues[0], {
      op: "removeChild",
      parent: p,
      target: text,
      wrapper: outer,
    });
  });

  it("inserts before the wrapper when the reference node is wrapped", () => {
    const proto = strictProto();
    const rescues: ForeignDomRescue[] = [];
    installForeignDomGuard(asDom(proto), (r) => rescues.push(r));
    const { p, text, outer } = translated();
    const badge = new FakeNode("span");
    strictEqual(proto.insertBefore.call(p, badge, text), badge);
    deepStrictEqual(p.childNodes, [badge, outer]);
    strictEqual(rescues[0]?.op, "insertBefore");
    strictEqual(rescues[0]?.wrapper, outer);
  });

  it("treats a node outside the parent as removed, or appends", () => {
    const proto = strictProto();
    const rescues: ForeignDomRescue[] = [];
    installForeignDomGuard(asDom(proto), (r) => rescues.push(r));
    const p = new FakeNode("p");
    const kept = p.appendChild(new FakeNode("span"));
    const gone = new FakeNode("#text");
    strictEqual(proto.removeChild.call(p, gone), gone);
    deepStrictEqual(p.childNodes, [kept]);
    const late = new FakeNode("em");
    proto.insertBefore.call(p, late, gone);
    deepStrictEqual(p.childNodes, [kept, late]);
    deepStrictEqual(
      rescues.map((r) => [r.op, r.wrapper]),
      [
        ["removeChild", null],
        ["insertBefore", null],
      ],
    );
  });

  it("without the guard the same calls throw (the crash being fixed)", () => {
    const proto = strictProto();
    const { p, text } = translated();
    throws(() => proto.removeChild.call(p, text), /NotFoundError/);
    throws(
      () => proto.insertBefore.call(p, new FakeNode("span"), text),
      /NotFoundError/,
    );
  });
});
