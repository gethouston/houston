import { useCallback, useSyncExternalStore } from "react";

export interface ComposerDraftStore {
  get(key: string): string;
  set(key: string, text: string): void;
  subscribe(onChange: () => void): () => void;
}

const subscribeNone = () => () => {};

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
