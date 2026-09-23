/**
 * `JSON.stringify` with every object's keys sorted, at every depth.
 *
 * Property order is an accident of how a value was BUILT — a wire object
 * parsed from JSON, one rebuilt field by field, and one spread through a mapper
 * carry the same content in three different orders. Anything that uses a
 * serialization as an IDENTITY (see `interactionDraftKey`) would otherwise call
 * those three different things.
 *
 * The contract covers JSON-DERIVED values — the plain objects, arrays and
 * primitives a wire parse produces, which is all `interactionDraftKey` ever
 * serializes. Over those, array order is meaningful and is kept, and everything
 * else matches `JSON.stringify` exactly: an `undefined` object property is
 * omitted, an `undefined` array element is written as `null`.
 *
 * Outside it there is no contract: a carrier JSON has no shape for (a `Date`, a
 * `Map`, a `Set`) is rebuilt from its own keys and serializes as `{}` — its
 * `toJSON` never runs — and a cycle overflows the stack rather than throwing
 * `JSON.stringify`'s TypeError.
 */
export function canonicalJson(value: unknown): string {
  // A value JSON has no representation for (undefined, a function, a symbol)
  // stringifies to `undefined`, not to a string. The sentinel is outside the
  // range of real output — a *string* "undefined" serializes with its quotes.
  return JSON.stringify(withSortedKeys(value)) ?? "undefined";
}

/** The same value with every plain object rebuilt in sorted key order. Insertion
 *  order is what `JSON.stringify` emits, so rebuilding IS the sort. */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = withSortedKeys(source[key]);
  }
  return sorted;
}
