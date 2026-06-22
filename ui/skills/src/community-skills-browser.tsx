/**
 * CommunitySkillsSection — Search and install skills from a community marketplace.
 *
 * Standalone surface (not inside the Add Skills dialog). Same resilience
 * pattern as `add-skill-dialog-store-view.tsx`: AbortController-driven
 * search, optional dedicated popular feed, typed-error-aware copy,
 * and per-row install state machine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunitySkill } from "./types";
import { CommunitySkillRow } from "./community-skill-row";
import { AlertCircle, Search } from "lucide-react";
import { classifySkillError } from "./skill-error-kinds";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export interface CommunitySkillsSectionProps {
  /** Called when the user types a search query (debounced internally).
   *  An AbortSignal is supplied; callers should pass it to fetch so
   *  in-flight requests cancel on the next keystroke. */
  onSearch: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  /** Optional dedicated popular feed used as the empty-state list. */
  onPopular?: (signal?: AbortSignal) => Promise<CommunitySkill[]>;
  /** Called when the user clicks install on a community skill. Returns the installed skill name. */
  onInstall: (skill: CommunitySkill, signal?: AbortSignal) => Promise<string>;
  /** Lowercase set of slugs already installed locally. Drives the
   *  "Already installed" state on rows the user already has. */
  installedSkillNames?: Set<string>;
  labels?: {
    heading?: string;
    subheading?: string;
    searchPlaceholder?: string;
    searchRateLimited?: string;
    searchOffline?: string;
    searchGeneric?: string;
    noResults?: (query: string) => string;
    showMore?: (n: number) => string;
    loading?: string;
    popularHeading?: string;
    popularUnavailable?: string;
    retry?: string;
  };
}

const DEFAULT_LABELS = {
  heading: "Discover actions from the community",
  subheading: "Browse reusable procedures on Skills.sh",
  searchPlaceholder:
    'Search by what you want to achieve, like "sdr" or "writing"',
  searchRateLimited:
    "Skills.sh is busy right now. Wait a moment and try again.",
  searchOffline: "Couldn't reach Skills.sh. Check your internet and try again.",
  searchGeneric: "Skill search hit a snag. Wait a moment and try again.",
  noResults: (query: string) => `No actions found for "${query}"`,
  showMore: (n: number) => `Show ${n} more`,
  loading: "Loading...",
  popularHeading: "Popular on Skills.sh",
  popularUnavailable: "Couldn't load suggestions. Try searching above.",
  retry: "Try again",
};

type Phase =
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

export function CommunitySkillsSection({
  onSearch,
  onPopular,
  onInstall,
  installedSkillNames,
  labels,
}: CommunitySkillsSectionProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [showAll, setShowAll] = useState(false);
  const [installState, setInstallState] = useState<
    Map<string, "installing" | "installed" | "failed">
  >(new Map());
  const popularLoadedRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const popularAbortRef = useRef<AbortController | null>(null);

  // Popular feed on first mount.
  useEffect(() => {
    if (popularLoadedRef.current) return;
    popularLoadedRef.current = true;
    if (!onPopular) {
      setPhase({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    popularAbortRef.current = controller;
    setPhase({ kind: "loading-popular" });
    onPopular(controller.signal)
      .then((skills) => {
        if (controller.signal.aborted) return;
        setPhase({ kind: "popular", skills });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (classifySkillError(err) === "aborted") return;
        setPhase({ kind: "popular-error" });
      });
    return () => {
      controller.abort();
    };
  }, [onPopular]);

  // User-typed search with abort + debounce.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      searchAbortRef.current?.abort();
      // Don't disturb popular state when query becomes empty.
      setPhase((prev) =>
        prev.kind === "results" ||
        prev.kind === "searching" ||
        prev.kind === "no-results" ||
        prev.kind === "search-error" ||
        prev.kind === "too-short"
          ? { kind: "idle" }
          : prev,
      );
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
      setPhase((prev) => ({
        kind: "searching",
        previous:
          prev.kind === "results"
            ? prev.skills
            : prev.kind === "searching"
              ? prev.previous
              : [],
      }));
      setShowAll(false);
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
            cls === "rate_limited" || cls === "github_rate_limited"
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
  }, [query, onSearch]);

  const retryPopular = useCallback(() => {
    if (!onPopular) return;
    popularAbortRef.current?.abort();
    const controller = new AbortController();
    popularAbortRef.current = controller;
    setPhase({ kind: "loading-popular" });
    onPopular(controller.signal)
      .then((skills) => {
        if (controller.signal.aborted) return;
        setPhase({ kind: "popular", skills });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPhase({ kind: "popular-error" });
      });
  }, [onPopular]);

  const handleInstall = useCallback(
    async (skill: CommunitySkill) => {
      setInstallState((prev) => {
        const next = new Map(prev);
        next.set(skill.id, "installing");
        return next;
      });
      try {
        await onInstall(skill);
        setInstallState((prev) => {
          const next = new Map(prev);
          next.set(skill.id, "installed");
          return next;
        });
      } catch {
        setInstallState((prev) => {
          const next = new Map(prev);
          next.set(skill.id, "failed");
          return next;
        });
      }
    },
    [onInstall],
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

  const visible = showAll ? visibleSkills : visibleSkills.slice(0, PAGE_SIZE);
  const hasMore = visibleSkills.length > PAGE_SIZE && !showAll;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">{l.heading}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{l.subheading}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={l.searchPlaceholder}
          className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm
                     placeholder:text-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
        />
      </div>

      {phase.kind === "popular" &&
        phase.skills.length > 0 &&
        query.trim() === "" && (
          <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
            {l.popularHeading}
          </p>
        )}

      {phase.kind === "loading-popular" && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {l.loading}
        </p>
      )}

      {phase.kind === "popular-error" && (
        <div className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="size-3.5 text-muted-foreground/60" />
            {l.popularUnavailable}
          </span>
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

      {phase.kind === "searching" && phase.previous.length === 0 && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {l.loading}
        </p>
      )}

      {phase.kind === "search-error" && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-500" />
          {phase.reason === "rate_limited"
            ? l.searchRateLimited
            : phase.reason === "offline"
              ? l.searchOffline
              : l.searchGeneric}
        </p>
      )}

      {phase.kind === "no-results" && (
        <p className="text-sm text-muted-foreground">
          {l.noResults(phase.query)}
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {visible.map((skill) => {
            const local = installState.get(skill.id);
            const slug = (skill.skillId || skill.name).toLowerCase();
            const alreadyInstalled = installedSkillNames?.has(slug) ?? false;
            return (
              <CommunitySkillRow
                key={skill.id}
                skill={skill}
                installing={local === "installing"}
                installed={local === "installed" || alreadyInstalled}
                onInstall={() => handleInstall(skill)}
              />
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {l.showMore(visibleSkills.length - PAGE_SIZE)}
        </button>
      )}
    </section>
  );
}
