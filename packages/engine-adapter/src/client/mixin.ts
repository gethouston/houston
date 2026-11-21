import type { HoustonClientBase } from "./base";

// biome-ignore lint/suspicious/noExplicitAny: mixin constructors are variadic by construction.
export type Ctor<T = object> = new (...args: any[]) => T;

export type BaseCtor = Ctor<HoustonClientBase>;
