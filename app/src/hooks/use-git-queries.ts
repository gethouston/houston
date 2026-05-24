/**
 * TanStack Query hooks for the engine's `/v1/git/*` routes (Phase 3 PR B
 * of RFC #248 / `advanced.git_panel`).
 *
 * The "is this cwd a git repo?" check is the gate that decides whether
 * `<GitPanel />` mounts. We don't want it to throw — when the engine
 * returns the `git_not_a_repo` labeled error we resolve to `false`
 * instead, so the component can render a clean empty state instead of
 * burning a toast.
 *
 * The three data hooks (status / log / diff) all share a stale time
 * short enough that the panel feels alive but long enough that scroll +
 * re-render don't refire git on every tick. The file watcher invalidates
 * status (the only one likely to change on the user's disk between
 * polls) — log and diff invalidate on explicit refresh.
 */
import { useQuery } from "@tanstack/react-query";
import {
  isHoustonEngineError,
  type GitDiffResponse,
  type GitLogResponse,
  type GitStatusResponse,
  GIT_NOT_A_REPO_KIND,
} from "@houston-ai/engine-client";
import { tauriGit } from "../lib/tauri";

const STATUS_STALE_MS = 5_000;
const LOG_STALE_MS = 30_000;
const DIFF_STALE_MS = 5_000;

export function useIsGitRepo(cwd: string | null | undefined) {
  return useQuery({
    queryKey: ["git", "is-repo", cwd ?? ""] as const,
    queryFn: async () => {
      if (!cwd) return false;
      try {
        await tauriGit.status(cwd);
        return true;
      } catch (err) {
        if (isHoustonEngineError(err) && err.kind === GIT_NOT_A_REPO_KIND) {
          return false;
        }
        throw err;
      }
    },
    enabled: Boolean(cwd),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useGitStatus(cwd: string | null | undefined) {
  return useQuery<GitStatusResponse>({
    queryKey: ["git", "status", cwd ?? ""] as const,
    queryFn: () => tauriGit.status(cwd as string),
    enabled: Boolean(cwd),
    staleTime: STATUS_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useGitLog(cwd: string | null | undefined, limit?: number) {
  return useQuery<GitLogResponse>({
    queryKey: ["git", "log", cwd ?? "", limit ?? "default"] as const,
    queryFn: () => tauriGit.log(cwd as string, limit),
    enabled: Boolean(cwd),
    staleTime: LOG_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useGitDiff(
  cwd: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery<GitDiffResponse>({
    queryKey: ["git", "diff", cwd ?? "", path ?? ""] as const,
    queryFn: () => tauriGit.diff(cwd as string, path ?? undefined),
    enabled: Boolean(cwd),
    staleTime: DIFF_STALE_MS,
    refetchOnWindowFocus: false,
  });
}
