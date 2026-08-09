import type { UserProfile } from "../../hooks/queries/use-user-profiles.ts";
import { shortUserLabel } from "../../lib/mission-people.ts";
import type {
  MentionInboxConversation,
  MentionInboxRow,
} from "./mentions-inbox-model.ts";

/**
 * The render-side rules of the Mentions inbox, kept pure and DOM-free beside
 * the ordering model ({@link import("./mentions-inbox-model.ts")}) so each is
 * asserted directly under plain node instead of through a rendered tree.
 *
 * All four answer questions the component must never improvise: how big a
 * number may get before it breaks the toolbar line, which profiles to fetch,
 * and — the load-bearing one — what to show for a person we only know by id.
 */

/**
 * The unread count as it appears on the notifications bell. Clamped because the
 * bell shares one line with a board's title, its filters and the search field:
 * a four-digit backlog would push the title off-screen, and past "lots" the
 * exact number tells the user nothing they act on differently.
 */
export function mentionCountLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The distinct mentioners across the inbox — the argument for the batched
 * `useUserProfiles` lookup. Deduped so one teammate who pinged five times costs
 * one profile, and stable in row order so the query key does not churn.
 */
export function mentionerIds(rows: readonly MentionInboxRow[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.byUserId || seen.has(row.byUserId)) continue;
    seen.add(row.byUserId);
    ids.push(row.byUserId);
  }
  return ids;
}

/**
 * Names the gateway already stamped onto missions, the fallback for a person
 * whose profile has not resolved yet. First stored entry for an id wins, the
 * same rule `buildMissionPeople` applies to face stacks, so a teammate cannot
 * be called one thing on a board card and another in this list.
 */
export function storedContributorNames(
  convs: readonly MentionInboxConversation[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const conv of convs) {
    for (const contributor of conv.contributors ?? []) {
      if (contributor.name && !names.has(contributor.user_id)) {
        names.set(contributor.user_id, contributor.name);
      }
    }
  }
  return names;
}

/**
 * The display name for a mentioner: live profile, else the stored contributor
 * name, else a short id slice. NEVER the raw id — our users are non-technical
 * and a 36-character UUID in "…mentioned you" reads as a bug.
 */
export function resolveMentionerName(
  userId: string,
  profiles: ReadonlyMap<string, UserProfile>,
  stored: ReadonlyMap<string, string>,
): string {
  return (
    profiles.get(userId)?.name ?? stored.get(userId) ?? shortUserLabel(userId)
  );
}
