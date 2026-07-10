/**
 * The category-shelves fetch hook for the marketplace browse (default) state.
 * Kicks every shelf off together once per section-open (the host serializes +
 * caches the outbound skills.sh calls, so concurrent category searches are
 * safe), tracks per-shelf `loading | ready | error` state, and shares a single
 * AbortController with the section `open` lifecycle. `retry` refires everything.
 * The pure derivations live in `skill-marketplace-shelves-model.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifySkillError } from "./skill-error-kinds";
import {
  allShelvesFailed,
  type MarketplaceShelf,
  type ResolvedShelf,
  type ShelfState,
  shelfStateFromSkills,
} from "./skill-marketplace-shelves-model";
import type { CommunitySkill } from "./types";

export interface UseSkillMarketplaceShelvesArgs {
  /** Section open state — drives reset-on-close and fetch-once-on-open. */
  open: boolean;
  /** Category shelves (titles already localized by the app). */
  shelves: MarketplaceShelf[];
  onSearch: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
}

export interface SkillMarketplaceShelvesState {
  /** The category shelves, resolved with their current fetch state. */
  shelves: ResolvedShelf[];
  /** Every shelf failed — degrade to the single retryable fallback. */
  allFailed: boolean;
  /** Refetch every shelf (host cache makes this cheap). */
  retry: () => void;
}

const LOADING: ShelfState = { status: "loading" };

export function useSkillMarketplaceShelves({
  open,
  shelves,
  onSearch,
}: UseSkillMarketplaceShelvesArgs): SkillMarketplaceShelvesState {
  const [states, setStates] = useState<Map<string, ShelfState>>(
    () => new Map(),
  );
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);

  const setState = useCallback((id: string, state: ShelfState) => {
    setStates((prev) => new Map(prev).set(id, state));
  }, []);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setStates(new Map(shelves.map((s) => [s.id, LOADING])));

    for (const shelf of shelves) {
      onSearch(shelf.query, signal)
        .then((skills) => {
          if (signal.aborted) return;
          setState(shelf.id, shelfStateFromSkills(skills));
        })
        .catch((err) => {
          if (signal.aborted) return;
          if (classifySkillError(err) === "aborted") return;
          setState(shelf.id, { status: "error" });
        });
    }
  }, [shelves, onSearch, setState]);

  // Section open lifecycle: fetch once per open, abort + clear on close.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      loadedRef.current = false;
      setStates(new Map());
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [open, load]);

  const resolved = useMemo<ResolvedShelf[]>(
    () =>
      shelves.map((shelf) => ({
        id: shelf.id,
        title: shelf.title,
        query: shelf.query,
        state: states.get(shelf.id) ?? LOADING,
      })),
    [shelves, states],
  );

  return {
    shelves: resolved,
    allFailed: allShelvesFailed(resolved.map((s) => s.state)),
    retry: load,
  };
}
