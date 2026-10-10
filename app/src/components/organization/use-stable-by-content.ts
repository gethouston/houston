import { useRef } from "react";

/**
 * `value`, keeping the previous object while its content is unchanged.
 *
 * The agent store hands out a fresh array on every reload (an
 * `AgentsChanged`, a role change, a reconnect), so a tree built from it is
 * a new object even when nothing it draws changed. The share dialog keys its
 * drawing and its post on the tree's identity, so an identical reload must
 * not look like a new chart. The key is the value's JSON, which for a tree
 * covers everything drawn: ids, names, roles, colours, photos and homes.
 */
export function useStableByContent<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value);
  if (ref.current === null || ref.current.key !== key)
    ref.current = { key, value };
  return ref.current.value;
}
