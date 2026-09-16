/**
 * The predicates and the id-disambiguator every normalize pass shares. Split
 * out so the routines pass (`normalize-routines.ts`) cannot grow a second copy
 * of the 64-char suffix rule that the skills/learnings passes already obey.
 */

/** Max length of a slug / learning id / routine id (SLUG_REGEX allows 64). */
export const MAX_ID_LEN = 64;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Return a value not in `seen` by suffixing `-2`, `-3`, … onto `base`, trimming
 * `base` so the suffix always survives the 64-char cap. Suffixing without the
 * trim would infinite-loop on a 64-char `base`: `${base}-2`.slice(0, 64) drops
 * the suffix and yields `base`, which is already in `seen`.
 */
export const disambiguate = (base: string, seen: Set<string>): string => {
  let uniq = base;
  let n = 2;
  while (seen.has(uniq)) {
    const suffix = `-${n++}`;
    uniq = base.slice(0, MAX_ID_LEN - suffix.length) + suffix;
  }
  return uniq;
};
