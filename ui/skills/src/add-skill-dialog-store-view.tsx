/**
 * StoreView — Skills.sh search and install tab for AddSkillDialog.
 *
 * Resilience design:
 * - Two-track network: a long-lived "popular" feed populates the
 *   empty state on dialog open, separate from the user-typed search.
 *   Both have their own engine cache slot so neither blocks the other.
 * - One in-flight request at a time per track. Each new keystroke
 *   aborts the previous search via AbortController so stale results
 *   never overwrite fresh ones and we don't waste skills.sh quota.
 * - Per-row install state machine: `available | already-installed |
 *   installing | installed-now | failed:<reason>`. Already-installed
 *   detection happens before the click using `installedSkillNames`,
 *   so users never click a button that silently no-ops.
 * - Typed errors. Engine returns `error.details.kind` strings the UI
 *   maps to plain-English copy (rate limited, offline, malformed,
 *   already installed, etc). No raw error messages reach the user.
 */

import { Spinner } from "@houston-ai/core";
import { AlertCircle, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STORE_VIEW_LABELS,
  type StoreViewLabels,
} from "./add-skill-dialog-store-labels";
import {
  type InstallFailureReason,
  type RowInstallState,
  StoreRow,
} from "./add-skill-dialog-store-row";
import { classifySkillError } from "./skill-error-kinds";
import type { CommunitySkill } from "./types";

const SEARCH_DEBOUNCE_MS = 350;

export interface StoreViewProps {
  open: boolean;
  onSearch: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  /**
   * Optional dedicated "popular skills" fetcher. When provided, the
   * dialog opens against this feed instead of seeding a fake search,
   * which means user-typed search never blocks behind it.
   */
  onPopular?: (signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstall: (skill: CommunitySkill, signal?: AbortSignal) => Promise<string>;
  /** Lowercase set of slugs already installed locally. Drives the
   *  "Already installed" badges and disables their install buttons. */
  installedSkillNames?: Set<string>;
  labels?: StoreViewLabels;
}

type SearchPhase =
  | { kind: "idle" }
  | { kind: "loading-popular" }
  | { kind: "popular"; skills: CommunitySkill[] }
  | { kind: "popular-error" }
  | { kind: "too-short" }
  | { kind: "searching"; previous: CommunitySkill[] }
  | { kind: "results"; skills: CommunitySkill[]; query: string }
  | { kind: "no-results"; query: string }
  | {
      kind: "search-error";
      reason: "rate_limited" | "offline" | "generic";
      query: string;
    };

interface RowInstallEntry {
  state: RowInstallState;
}

export function StoreView({
  open,
  onSearch,
  onPopular,
  onInstall,
  installedSkillNames,
  labels,
}: StoreViewProps) {
  const l = { ...DEFAULT_STORE_VIEW_LABELS, ...labels };
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<SearchPhase>({ kind: "idle" });
  const [installs, setInstalls] = useState<Map<string, RowInstallEntry>>(
    () => new Map(),
  );
  const popularLoadedRef = useRef(false);
  /**
   * Keep the popular skills around once fetched so we can restore them
   * when the user clears the search box. Without this, clearing the
   * input drops the user back to an empty surface even though we
   * already paid for the popular fetch.
   */
  const popularSkillsRef = useRef<CommunitySkill[] | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const popularAbortRef = useRef<AbortController | null>(null);
  const installAbortsRef = useRef<Map<string, AbortController>>(new Map());

  // Dialog open lifecycle: clear state on close, kick off popular fetch
  // on open. The popular fetch is the ONLY network call that happens
  // automatically — search fires only when the user types.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setPhase({ kind: "idle" });
      setInstalls(new Map());
      popularLoadedRef.current = false;
      popularSkillsRef.current = null;
      searchAbortRef.current?.abort();
      popularAbortRef.current?.abort();
      installAbortsRef.current.forEach((c) => {
        c.abort();
      });
      installAbortsRef.current.clear();
      return;
    }
    if (popularLoadedRef.current) return;
    popularLoadedRef.current = true;

    if (!onPopular) {
      // Fallback: without a popular fetcher just show the empty hint.
      setPhase({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    popularAbortRef.current = controller;
    setPhase({ kind: "loading-popular" });
    onPopular(controller.signal)
      .then((skills) => {
        if (controller.signal.aborted) return;
        if (skills.length === 0) {
          popularSkillsRef.current = null;
          setPhase({ kind: "popular-error" });
        } else {
          popularSkillsRef.current = skills;
          setPhase({ kind: "popular", skills });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const cls = classifySkillError(err);
        if (cls === "aborted") return;
        popularSkillsRef.current = null;
        setPhase({ kind: "popular-error" });
      });

    return () => {
      controller.abort();
    };
  }, [open, onPopular]);

  // User-typed search with debounce + abort. Each keystroke after the
  // debounce window aborts any in-flight request, so we never apply
  // stale results.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();

    if (trimmed === "") {
      // Empty query → restore popular results if we already have them
      // cached in the ref. The ref persists across query changes so
      // typing then clearing returns the user to the popular feed
      // without a re-fetch.
      searchAbortRef.current?.abort();
      const cached = popularSkillsRef.current;
      if (cached && cached.length > 0) {
        setPhase({ kind: "popular", skills: cached });
      } else {
        setPhase((prev) => {
          if (
            prev.kind === "loading-popular" ||
            prev.kind === "popular-error"
          ) {
            return prev;
          }
          return { kind: "idle" };
        });
      }
      return;
    }

    if (trimmed.length < 2) {
      searchAbortRef.current?.abort();
      setPhase({ kind: "too-short" });
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timer = setTimeout(() => {
      // Show a "searching" state that keeps the previous results
      // visible (avoids flicker as the user keeps typing).
      setPhase((prev) => ({
        kind: "searching",
        previous:
          prev.kind === "results"
            ? prev.skills
            : prev.kind === "searching"
              ? prev.previous
              : [],
      }));

      onSearch(trimmed, controller.signal)
        .then((skills) => {
          if (controller.signal.aborted) return;
          if (skills.length === 0) {
            setPhase({ kind: "no-results", query: trimmed });
          } else {
            setPhase({ kind: "results", skills, query: trimmed });
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          const cls = classifySkillError(err);
          if (cls === "aborted") return;
          const reason: "rate_limited" | "offline" | "generic" =
            cls === "rate_limited"
              ? "rate_limited"
              : cls === "offline"
                ? "offline"
                : "generic";
          setPhase({ kind: "search-error", reason, query: trimmed });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, onSearch, open]);

  // Popular fetch retry — used by the "Try again" button when popular fails.
  const retryPopular = useCallback(() => {
    if (!onPopular) return;
    popularAbortRef.current?.abort();
    const controller = new AbortController();
    popularAbortRef.current = controller;
    setPhase({ kind: "loading-popular" });
    onPopular(controller.signal)
      .then((skills) => {
        if (controller.signal.aborted) return;
        if (skills.length === 0) {
          popularSkillsRef.current = null;
          setPhase({ kind: "popular-error" });
        } else {
          popularSkillsRef.current = skills;
          setPhase({ kind: "popular", skills });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (classifySkillError(err) === "aborted") return;
        popularSkillsRef.current = null;
        setPhase({ kind: "popular-error" });
      });
  }, [onPopular]);

  // Install handler — per-row state machine with kind-aware error copy.
  const handleInstall = useCallback(
    async (skill: CommunitySkill) => {
      const controller = new AbortController();
      installAbortsRef.current.set(skill.id, controller);
      setInstalls((prev) => {
        const next = new Map(prev);
        next.set(skill.id, { state: { kind: "installing" } });
        return next;
      });
      try {
        await onInstall(skill, controller.signal);
        setInstalls((prev) => {
          const next = new Map(prev);
          next.set(skill.id, { state: { kind: "installed-now" } });
          return next;
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const cls = classifySkillError(err);
        if (cls === "aborted") return;
        const reason = installFailureReason(cls);
        setInstalls((prev) => {
          const next = new Map(prev);
          next.set(skill.id, { state: { kind: "failed", reason } });
          return next;
        });
      } finally {
        installAbortsRef.current.delete(skill.id);
      }
    },
    [onInstall],
  );

  const stateForSkill = useCallback(
    (skill: CommunitySkill): RowInstallState => {
      const local = installs.get(skill.id);
      if (local) return local.state;
      const slug = (skill.skillId || skill.name).toLowerCase();
      if (installedSkillNames?.has(slug)) return { kind: "already-installed" };
      return { kind: "available" };
    },
    [installs, installedSkillNames],
  );

  const visibleSkills = useMemo<CommunitySkill[]>(() => {
    switch (phase.kind) {
      case "popular":
        return phase.skills;
      case "results":
        return phase.skills;
      case "searching":
        return phase.previous;
      default:
        return [];
    }
  }, [phase]);

  const installedInList = useMemo(() => {
    if (!installedSkillNames || installedSkillNames.size === 0) return 0;
    return visibleSkills.reduce((acc, s) => {
      const slug = (s.skillId || s.name).toLowerCase();
      return installedSkillNames.has(slug) ? acc + 1 : acc;
    }, 0);
  }, [visibleSkills, installedSkillNames]);

  return (
    <>
      <div className="shrink-0 px-6 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={l.searchPlaceholder}
            // biome-ignore lint/a11y/noAutofocus: search input in a modal dialog; autofocus is intentional UX
            autoFocus
            className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {/* "X already installed" hint above the popular list when applicable. */}
        {phase.kind === "popular" &&
          phase.skills.length > 0 &&
          installedInList > 0 && (
            <p className="px-6 pb-2 text-xs text-muted-foreground/60">
              {l.alreadyInstalledHint(installedInList)}
            </p>
          )}

        {/* Loading: popular feed cold start. */}
        {phase.kind === "loading-popular" && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            <span>{l.loadingPopular}</span>
          </div>
        )}

        {/* Popular failed but the user can still search. */}
        {phase.kind === "popular-error" && (
          <div className="px-6 py-4 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="size-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {l.popularUnavailable}
            </p>
            {onPopular && (
              <button
                type="button"
                onClick={retryPopular}
                className="text-xs text-foreground underline-offset-4 hover:underline"
              >
                {l.retry}
              </button>
            )}
          </div>
        )}

        {/* No popular fetcher and no query — invite typing. */}
        {phase.kind === "idle" && (
          <p className="text-sm text-muted-foreground px-6 py-4 text-center">
            {l.typeToSearch}
          </p>
        )}

        {/* 1-character query. */}
        {phase.kind === "too-short" && (
          <p className="text-sm text-muted-foreground px-6 py-4 text-center">
            {l.minQuery}
          </p>
        )}

        {/* Searching with a previous result set still showing. */}
        {phase.kind === "searching" && phase.previous.length === 0 && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}

        {/* No results for this query. */}
        {phase.kind === "no-results" && (
          <p className="text-sm text-muted-foreground px-6 py-4 text-center">
            {l.noResults(phase.query)}
          </p>
        )}

        {/* Typed search error. Distinct copy per cause. */}
        {phase.kind === "search-error" && (
          <div className="px-6 py-6 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="size-5 text-amber-600 dark:text-amber-500" />
            <p className="text-sm text-muted-foreground max-w-sm">
              {phase.reason === "rate_limited"
                ? l.searchRateLimited
                : phase.reason === "offline"
                  ? l.searchOffline
                  : l.searchGeneric}
            </p>
          </div>
        )}

        {visibleSkills.length > 0 && (
          <div className="divide-y divide-border border-y border-border">
            {visibleSkills.map((skill) => (
              <StoreRow
                key={skill.id}
                skill={skill}
                state={stateForSkill(skill)}
                onInstall={() => handleInstall(skill)}
                labels={l}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function installFailureReason(
  cls: ReturnType<typeof classifySkillError>,
): InstallFailureReason {
  switch (cls) {
    case "already_installed":
      return "already_installed";
    case "skill_not_in_repo":
    case "skill_not_found":
    case "repo_not_found":
    case "repo_no_skills":
    case "repo_private":
      return "skill_not_in_repo";
    case "skill_malformed":
    case "parse_failed":
    case "validation":
      return "skill_malformed";
    case "rate_limited":
    case "github_rate_limited":
      return "rate_limited";
    case "offline":
      return "offline";
    default:
      return "generic";
  }
}
