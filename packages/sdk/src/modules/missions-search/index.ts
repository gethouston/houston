/**
 * The mission-search module — ranked full-text search over an agent's (or every
 * agent's) missions, mirroring the desktop's semantics EXACTLY
 * (`app/src/components/mission-search.ts`, PARITY §3): a TITLE match first, then
 * a DESCRIPTION match, then the mission's lazily-fetched chat-history CONTENT,
 * over the same per-feed-item searchable text. History is fetched ONLY for
 * missions not already matched by title/description, with bounded concurrency
 * and NO observers (a plain `getHistory`, never a stream). Search runs over ALL
 * statuses (active + archived), as the board does.
 *
 * This is a pure command (`missions/search`) — it returns ranked matches, it
 * publishes no scope and holds no long-lived resource.
 */

import type { Activity } from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import { createActivitiesHttp } from "../activities/http";
import { sessionKeyOf } from "../activities/types";
import { historyToFeed } from "../turns/history";
import {
  buildHistorySearchText,
  extractSnippet,
  matchesPhrase,
  normalizeQuery,
} from "./search-text";

/** Where in a mission the query matched. Ranked in this order. */
export type MatchedIn = "title" | "description" | "content";

/** One ranked mission match. `snippet` is omitted for a title match (the title
 *  already shows the phrase and is never highlighted, per the desktop). */
export interface MissionMatch {
  agentId: string;
  activityId: string;
  sessionKey: string;
  title: string;
  snippet?: string;
  matchedIn: MatchedIn;
}

/** The typed facade for mission search. */
export interface MissionsSearchModule {
  /** Search `query` across `agentId`'s missions, or every agent's when omitted. */
  search(query: string, agentId?: string): Promise<MissionMatch[]>;
}

/** How many history fetches (or agent activity lists) run at once. */
const CONCURRENCY = 4;

/** Run `fn` over `items` with at most `limit` in flight, preserving no order. */
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    })(),
  );
  await Promise.all(workers);
}

interface Candidate {
  agentId: string;
  activity: Activity;
}

export function createMissionsSearchModule(
  ctx: ModuleContext,
): MissionsSearchModule {
  const { config, clientFor, authExpiry } = ctx;
  const { baseUrl, ports } = config;
  const root = baseUrl.replace(/\/+$/, "");
  const emitTokenExpired = () => authExpiry.notifyExpired();
  const http = createActivitiesHttp(baseUrl, ports, emitTokenExpired);

  /** The agents to search: the one given, else the whole personal workspace. */
  async function resolveAgentIds(agentId?: string): Promise<string[]> {
    if (agentId) return [agentId];
    const res = await ports.fetch(`${root}/agents`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) emitTokenExpired();
      throw new Error(`agents request failed: ${res.status}`);
    }
    return ((await res.json()) as { id: string }[]).map((a) => a.id);
  }

  function match(
    c: Candidate,
    matchedIn: MatchedIn,
    snippet: string | null,
  ): MissionMatch {
    return {
      agentId: c.agentId,
      activityId: c.activity.id,
      sessionKey: sessionKeyOf(c.activity),
      title: c.activity.title,
      matchedIn,
      ...(snippet ? { snippet } : {}),
    };
  }

  async function search(
    query: string,
    agentId?: string,
  ): Promise<MissionMatch[]> {
    const folded = normalizeQuery(query);
    if (!folded) return [];

    const agentIds = await resolveAgentIds(agentId);
    const candidates: Candidate[] = [];
    await mapLimit(agentIds, CONCURRENCY, async (id) => {
      for (const activity of await http.list(id))
        candidates.push({ agentId: id, activity });
    });

    const titleMatches: MissionMatch[] = [];
    const descriptionMatches: MissionMatch[] = [];
    const unmatched: Candidate[] = [];
    for (const c of candidates) {
      if (matchesPhrase(c.activity.title, folded)) {
        titleMatches.push(match(c, "title", null));
        continue;
      }
      const description = c.activity.description ?? "";
      if (description && matchesPhrase(description, folded)) {
        descriptionMatches.push(
          match(c, "description", extractSnippet(description, folded)),
        );
        continue;
      }
      unmatched.push(c);
    }

    // Lazily search chat-history content for the still-unmatched missions,
    // bounded so N missions never spawn N simultaneous fetches. A per-mission
    // history failure degrades that mission (mirrors the desktop's non-fatal
    // "couldn't search every mission" notice) — logged through the port, never
    // silently dropped, and never failing the matches we already have.
    const contentMatches: MissionMatch[] = [];
    await mapLimit(unmatched, CONCURRENCY, async (c) => {
      const sessionKey = sessionKeyOf(c.activity);
      let text: string;
      try {
        const { messages } = await clientFor(c.agentId).getHistory(sessionKey);
        text = buildHistorySearchText(historyToFeed(messages));
      } catch (err) {
        ports.logger.warn("mission search: history fetch failed", {
          agentId: c.agentId,
          sessionKey,
          error: String(err),
        });
        return;
      }
      if (text && matchesPhrase(text, folded))
        contentMatches.push(match(c, "content", extractSnippet(text, folded)));
    });

    return [...titleMatches, ...descriptionMatches, ...contentMatches];
  }

  ctx.registerCommand("missions/search", (payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.query !== "string")
      throw new Error("missions/search requires a string query");
    return search(
      p.query,
      typeof p.agentId === "string" ? p.agentId : undefined,
    );
  });

  return { search };
}
