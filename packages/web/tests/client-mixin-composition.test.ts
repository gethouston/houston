import { HoustonClient, MIXINS } from "@houston/engine-adapter/client";
import { HoustonClientBase } from "@houston/engine-adapter/client/base";
import type { BaseCtor } from "@houston/engine-adapter/client/mixin";
import { expect, test } from "vitest";

const modules = import.meta.glob<Record<string, unknown>>(
  "../../engine-adapter/src/client/*-mixin.ts",
  { eager: true },
);

type MixinFactory = (Base: BaseCtor) => BaseCtor;

const isFactory = (value: unknown): value is MixinFactory =>
  typeof value === "function";

const factoriesIn = (module: Record<string, unknown>): MixinFactory[] =>
  Object.entries(module)
    .filter(([name, value]) => name.endsWith("Mixin") && isFactory(value))
    .map(([, value]) => value as MixinFactory);

const methodsOf = (mixin: MixinFactory): string[] =>
  Object.getOwnPropertyNames(mixin(HoustonClientBase).prototype).filter(
    (name) => name !== "constructor",
  );

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
