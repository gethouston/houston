import type { HoustonClientBase } from "./base";

/**
 * A constructor type for the mixin pattern. `HoustonClient` is assembled from a
 * chain of cluster mixins over {@link HoustonClientBase}; each mixin is a class
 * factory `(<TBase extends BaseCtor>(Base) => class extends Base { … })`. The
 * mixins add the public method clusters (workspaces, agents, chat, providers, …)
 * while all shared state lives once on `this.ctx` ({@link AdapterContext}) —
 * there is no per-cluster copy of `cp`/`engine`/`sdk`.
 */
// biome-ignore lint/suspicious/noExplicitAny: mixin constructors are variadic by construction.
export type Ctor<T = object> = new (...args: any[]) => T;

/** The base every cluster mixin extends — carries the shared `ctx`. */
export type BaseCtor = Ctor<HoustonClientBase>;
