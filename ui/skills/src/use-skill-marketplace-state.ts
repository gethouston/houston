/**
 * The search / install state machine behind the marketplace grid. Owns the
 * effectful glue only (debounce, AbortController, section lifecycle); the pure
 * phase decisions live in `skill-marketplace-state-model.ts`. The search term is
 * either the typed query (debounced) or, when the box is empty, the selected
 * category's query (fired immediately) — so picking a category shows its full
 * result list without writing into the search box. Per-skill install state is
 * keyed by id in the exact `installing | installed | failed` shape the grid
 * consumes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { classifySkillError } from "./skill-error-kinds";
import type { SkillMarketplacePhase } from "./skill-marketplace-grid";
import {
  effectiveSearchTerm,
  resultsPhase,
  searchErrorPhase,
  searchingPrevious,
} from "./skill-marketplace-state-model";
import type { CommunitySkill } from "./types";

const SEARCH_DEBOUNCE_MS = 350;

export type MarketplaceInstallState = Map<
  string,
  "installing" | "installed" | "failed"
>;

export interface UseSkillMarketplaceStateArgs {
  /** Section open state — drives reset-on-close. */
  open: boolean;
  onSearch: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstall: (skill: CommunitySkill, signal?: AbortSignal) => Promise<string>;
  /**
   * The selected category's skills.sh query, or `null` for "All categories".
   * When the search box is empty a non-null value drives the flat result grid.
   */
  categoryQuery: string | null;
}

export interface SkillMarketplaceState {
  query: string;
  setQuery: (q: string) => void;
  phase: SkillMarketplacePhase;
  installState: MarketplaceInstallState;
  install: (skill: CommunitySkill) => void;
}

export function useSkillMarketplaceState({
  open,
  onSearch,
  onInstall,
  categoryQuery,
}: UseSkillMarketplaceStateArgs): SkillMarketplaceState {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<SkillMarketplacePhase>({ kind: "idle" });
  const [installState, setInstallState] = useState<MarketplaceInstallState>(
    () => new Map(),
  );
  const searchAbortRef = useRef<AbortController | null>(null);
  const installAbortsRef = useRef<Map<string, AbortController>>(new Map());

  // Section close: clear query + phase + install state and abort everything.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setPhase({ kind: "idle" });
    setInstallState(new Map());
    searchAbortRef.current?.abort();
    installAbortsRef.current.forEach((c) => {
      c.abort();
    });
    installAbortsRef.current.clear();
  }, [open]);

  // The effective search: a typed query (debounced) beats a selected category
  // (fired immediately); an empty term parks on `idle` (the browse shelves).
  useEffect(() => {
    if (!open) return;
    const typed = query.trim();
    const term = effectiveSearchTerm(query, categoryQuery);

    if (term === "") {
      searchAbortRef.current?.abort();
      setPhase({ kind: "idle" });
      return;
    }
    if (typed !== "" && typed.length < 2) {
      searchAbortRef.current?.abort();
      setPhase({ kind: "too-short" });
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    const delay = typed !== "" ? SEARCH_DEBOUNCE_MS : 0;

    const timer = setTimeout(() => {
      setPhase((prev) => ({
        kind: "searching",
        previous: searchingPrevious(prev),
      }));
      onSearch(term, controller.signal)
        .then((skills) => {
          if (controller.signal.aborted) return;
          setPhase(resultsPhase(skills, term));
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          const next = searchErrorPhase(err, term);
          if (next) setPhase(next);
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, categoryQuery, onSearch, open]);

  // Install with a per-skill state machine. The failure state re-enables the
  // button; the visible failure reason (toast) is surfaced by the app caller.
  const install = useCallback(
    (skill: CommunitySkill) => {
      installAbortsRef.current.get(skill.id)?.abort();
      const controller = new AbortController();
      installAbortsRef.current.set(skill.id, controller);
      setInstallState((prev) => new Map(prev).set(skill.id, "installing"));
      onInstall(skill, controller.signal)
        .then(() => {
          if (controller.signal.aborted) return;
          setInstallState((prev) => new Map(prev).set(skill.id, "installed"));
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (classifySkillError(err) === "aborted") return;
          setInstallState((prev) => new Map(prev).set(skill.id, "failed"));
        })
        .finally(() => {
          installAbortsRef.current.delete(skill.id);
        });
    },
    [onInstall],
  );

  return {
    query,
    setQuery,
    phase,
    installState,
    install,
  };
}
