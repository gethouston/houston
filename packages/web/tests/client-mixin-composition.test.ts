import { HoustonClient, MIXINS } from "@houston/engine-adapter/client";
import { HoustonClientBase } from "@houston/engine-adapter/client/base";
import type { BaseCtor } from "@houston/engine-adapter/client/mixin";
import { expect, test } from "vitest";

/**
 * `HoustonClient` is folded from a flat list of cluster mixins, which is only
 * sound while three things hold — and none of them is visible at the fold.
 *
 *  - the clusters are method-disjoint, so the order the list happens to be
 *    written in cannot change what the client exposes;
 *  - every mixin module under `client/` is actually in the list (a cluster
 *    written and never composed would simply be missing at runtime, with the
 *    caller's `TypeError` as the only sign);
 *  - the fold reaches all of them, so the composed prototype carries exactly
 *    the union of what the mixins and the base declare — nothing dropped.
 */

/** Every `*-mixin.ts` module beside `client.ts`, found on disk rather than
 *  listed here: a new cluster must show up in this test without being added
 *  to it, or the list it is missing from proves nothing. */
const modules = import.meta.glob<Record<string, unknown>>(
  "../../engine-adapter/src/client/*-mixin.ts",
  { eager: true },
);

type MixinFactory = (Base: BaseCtor) => BaseCtor;

const isFactory = (value: unknown): value is MixinFactory =>
  typeof value === "function";

/** The factories a mixin module publishes, by `<Name>Mixin` export. */
const factoriesIn = (module: Record<string, unknown>): MixinFactory[] =>
  Object.entries(module)
    .filter(([name, value]) => name.endsWith("Mixin") && isFactory(value))
    .map(([, value]) => value as MixinFactory);

/** The method names a mixin contributes on its own, over the bare base. */
const methodsOf = (mixin: MixinFactory): string[] =>
  Object.getOwnPropertyNames(mixin(HoustonClientBase).prototype).filter(
    (name) => name !== "constructor",
  );

/** Every own method name up the prototype chain of `ctor`. */
function surfaceOf(ctor: BaseCtor): Set<string> {
  const names = new Set<string>();
  let proto: object | null = ctor.prototype;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto))
      if (name !== "constructor") names.add(name);
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}

test("every mixin module beside client.ts is composed into the client", () => {
  const listed = new Set<unknown>(MIXINS);
  const onDisk = Object.entries(modules).flatMap(([path, module]) =>
    factoriesIn(module).map((factory) => [path, factory] as const),
  );

  expect(onDisk.length).toBe(MIXINS.length);
  for (const [path, factory] of onDisk)
    expect(listed.has(factory), `${path} is never composed`).toBe(true);
});

test("no two clusters claim the same method name", () => {
  const owner = new Map<string, MixinFactory>();
  for (const mixin of MIXINS)
    for (const method of methodsOf(mixin)) {
      const taken = owner.get(method);
      expect(
        taken,
        `${method} is declared by both ${taken?.name} and ${mixin.name}`,
      ).toBeUndefined();
      owner.set(method, mixin);
    }
});

test("the composed client exposes exactly the union of its parts", () => {
  const expected = new Set(surfaceOf(HoustonClientBase));
  for (const mixin of MIXINS)
    for (const method of methodsOf(mixin)) expected.add(method);

  expect([...surfaceOf(HoustonClient)].sort()).toEqual([...expected].sort());
});
