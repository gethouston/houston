import type { MentionPerson } from "@houston-ai/chat";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isIdentityConfigured } from "../../lib/identity";
import { isMultiplayer } from "../../lib/org-roles";
import { tauriOrg } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import { useSession } from "../use-session";
import { excludeSelf, toMentionPeople } from "./org-people-map";

/** Query key for the active space's co-member directory. */
export const ORG_PEOPLE_KEY = "org-people";

// Stable empty identity so a disabled hook (single-player, signed out, an
// older gateway) hands every consumer the SAME array each render — a fresh
// `[]` would repaint the memoized composer popover and message renderer.
const EMPTY_PEOPLE: readonly MentionPerson[] = [];

/** The two rosters @mentions need. See {@link useOrgPeople}. */
export interface OrgPeopleRoster {
  /**
   * Everyone in the active space who has a display name, the VIEWER INCLUDED.
   * This is the RENDER roster: an agent reply that writes "@Julian" must chip
   * for Julian while Julian is the one reading it.
   */
  people: readonly MentionPerson[];
  /**
   * {@link people} minus the caller. This is the COMPOSER list: you do not
   * @mention yourself.
   */
  mentionable: readonly MentionPerson[];
}

/**
 * The active space's co-member directory for @mentions (HOU-944), from the
 * gateway's `GET /v1/org/people`.
 *
 * Multiplayer-gated exactly like {@link useUserProfiles}: single-player and
 * self-host have no roster to mention, and the route only exists on the hosted
 * gateway. Off-gateway (or on a gateway predating the route, which 404s) the
 * read degrades to an EMPTY list — `@` then just types plainly and no popover
 * ever opens. This is a cosmetic, non-user-initiated read, so it never toasts
 * and is never captured (see `tauriOrg.people`); a failure is indistinguishable
 * from an empty space by design.
 *
 * Cached generously (a roster changes when someone joins or leaves). The query
 * key is not space-scoped because switching spaces drops the whole query cache.
 */
export function useOrgPeople(): OrgPeopleRoster {
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const enabled = isIdentityConfigured() && isMultiplayer(capabilities);

  const query = useQuery({
    queryKey: [ORG_PEOPLE_KEY],
    queryFn: () => tauriOrg.people().then(toMentionPeople),
    enabled,
    staleTime: 5 * 60_000,
  });

  const people = query.data ?? EMPTY_PEOPLE;
  const selfUserId = session?.uid;
  const mentionable = useMemo(
    () => excludeSelf(people, selfUserId),
    [people, selfUserId],
  );

  return { people, mentionable };
}
