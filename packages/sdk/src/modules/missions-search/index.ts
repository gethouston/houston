import type { Activity } from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import { createActivitiesHttp } from "../activities/http";
import { sessionKeyOf } from "../activities/view-model";
import { agentsScope, createAgentsHttp } from "../agents/http";
import { historyToFeed } from "../turns/history";
import {
  buildHistorySearchText,
  extractSnippet,
  matchesPhrase,
  normalizeQuery,
} from "./search-text";

export type MatchedIn = "title" | "description" | "content";

export interface MissionMatch {
  agentId: string;
  activityId: string;
  sessionKey: string;
  title: string;
  snippet?: string;
  matchedIn: MatchedIn;
}

export interface MissionsSearchModule {
  search(query: string, agentId?: string): Promise<MissionMatch[]>;
}

const CONCURRENCY = 4;

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
  const { clientFor } = ctx;
  const { ports } = ctx.config;
  const http = createActivitiesHttp(ctx);
  const agents = createAgentsHttp(agentsScope(ctx));

  async function resolveAgentIds(agentId?: string): Promise<string[]> {
    if (agentId) return [agentId];
    return (await agents.list()).map((a) => a.id);
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

  return {
    /**
     * Finds missions whose title, description or chat mentions a phrase.
     * @param query The words to look for.
     * @param agentId The agent to search, by the id listAgents returns; every
     *   agent is searched when it is left out.
     * @assistant group:missions
     * @assistant unroutable: it reads every agent's missions and then each unmatched mission's transcript, which is a search over many reads, not one route.
     */
    search,
  };
}
