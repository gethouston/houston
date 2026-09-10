import type { CommunitySkill } from "@houston/protocol";
import { SkillRemoteError } from "./remote-error";

export interface CommunityFetchArgs {
  endpoint: string;
  query: string;
  fetchImpl: typeof fetch;
  /** The caller's cancellation (the host route's client-gone signal). */
  signal: AbortSignal | null;
  /** Per-attempt budget for one skills.sh round-trip. */
  timeoutMs: number;
  retryDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

/**
 * One skills.sh search round-trip. Retries once after a delay on HTTP 429.
 *
 * The caller's signal rides INTO the upstream fetch, joined with the request
 * budget: a superseded search (the user typed again, the host route saw the
 * client hang up) cancels its skills.sh request instead of running to the
 * 10 s timeout and holding the outbound slot (PRODUCT-1728). Every failure is
 * typed by cause — the caller's own cancellation rethrows its reason, the
 * budget expiring is `upstream_timeout`, a transport drop is `offline`, and an
 * answer we cannot use is `upstream_error` — so the client can tell expected
 * weather from a real fault.
 */
export async function fetchCommunitySearch(
  args: CommunityFetchArgs,
): Promise<CommunitySkill[]> {
  const { endpoint, query, fetchImpl, signal: caller, timeoutMs } = args;
  for (let attempt = 0; ; attempt++) {
    const budget = AbortSignal.timeout(timeoutMs);
    const signal = caller ? AbortSignal.any([budget, caller]) : budget;
    let res: Response;
    try {
      res = await fetchImpl(`${endpoint}?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "houston-skills/1.0" },
        signal,
      });
    } catch (err) {
      if (caller?.aborted) throw caller.reason ?? err;
      if (budget.aborted) {
        console.warn(
          `[host-skills] skills.sh search timed out after ${timeoutMs}ms`,
        );
        throw new SkillRemoteError(
          "upstream_timeout",
          `skills.sh search timed out after ${timeoutMs}ms`,
        );
      }
      throw new SkillRemoteError(
        "offline",
        `skills.sh search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status === 429 && attempt === 0) {
      await args.sleep(args.retryDelayMs);
      continue;
    }
    if (res.status === 429) {
      throw new SkillRemoteError(
        "rate_limited",
        "skills.sh rate limit hit, wait a moment and try again",
      );
    }
    if (!res.ok) {
      throw new SkillRemoteError(
        "upstream_error",
        `Skills search failed (${res.status})`,
      );
    }

    const body = (await res.json().catch(() => null)) as {
      skills?: unknown;
    } | null;
    if (!body || !Array.isArray(body.skills)) {
      throw new SkillRemoteError("upstream_error", "Failed to parse results");
    }
    return body.skills as CommunitySkill[];
  }
}
