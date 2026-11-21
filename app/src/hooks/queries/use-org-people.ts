import type { MentionPerson } from "@houston-ai/chat";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isIdentityConfigured } from "../../lib/identity";
import { isMultiplayer } from "../../lib/org-roles";
import { tauriOrg } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import { useSession } from "../use-session";
import { excludeSelf, toMentionPeople } from "./org-people-map";

export const ORG_PEOPLE_KEY = "org-people";

const EMPTY_PEOPLE: readonly MentionPerson[] = [];

export interface OrgPeopleRoster {
  people: readonly MentionPerson[];
  mentionable: readonly MentionPerson[];
}

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
