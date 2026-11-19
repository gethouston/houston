import { useCallback, useSyncExternalStore } from "react";

/**
 * A store of composer drafts, read and written by draft key. Only the composer
 * subscribes to it, so a keystroke re-renders the composer and nothing around
 * it: a `value` held by the board would re-render the whole board, the
 * message list and every card on each key.
 */
export interface ComposerDraftStore {
  get(key: string): string;
  set(key: string, text: string): void;
  /** Called on every store change; `get` decides whether this key moved. */
  subscribe(onChange: () => void): () => void;
}

const subscribeNone = () => () => {};

/** The live draft at `key`, or `undefined` when there is no store to read. */
export function useComposerDraft(
  store: ComposerDraftStore | undefined,
  key: string | undefined,
): { text: string; set: (text: string) => void } | undefined {
  const read = () => (store && key !== undefined ? store.get(key) : undefined);
  const text = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    read,
    read,
  );
  const set = useCallback(
    (next: string) => {
      if (store && key !== undefined) store.set(key, next);
    },
    [store, key],
  );
  return text === undefined ? undefined : { text, set };
}
