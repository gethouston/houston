import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { buildSharePeople, withViewer } from "./agent-access-model";
import { AgentSharePersonRow } from "./agent-share-person-row";

/**
 * The read-only "who has access" view of an agent (the `"view"` share surface).
 * A plain member who can use a shared agent but not manage it still gets Google
 * Docs parity: they SEE the people with access instead of a dead button. The
 * gateway withholds the full assignee roster from non-managers, so the list
 * shows the truthful subset it can resolve — {@link withViewer} guarantees the
 * viewer's own row so it is never empty. No controls: management is gated to the
 * {@link import("./agent-share-dialog").AgentShareDialog} for agent-managers.
 */
export function AgentSharePeopleDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const org = useOrg(isMultiplayer(capabilities) && open);

  const selfId = session?.user?.id ?? null;
  const members = org.data?.members ?? [];
  const people = withViewer(buildSharePeople({ agent, members, selfId }), {
    userId: selfId,
    email: session?.user?.email,
  });
  const { profiles } = useUserProfiles(people.map((p) => p.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("share.viewTitle", { name: agent.name })}
          </DialogTitle>
          <DialogDescription>{t("share.viewSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {org.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : (
            <ul className="space-y-2">
              {people.map((person) => (
                <AgentSharePersonRow
                  key={person.userId}
                  person={person}
                  avatarUrl={avatarUrlFromProfiles(profiles, person.userId)}
                  readOnly
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            {t("share.conversationNote")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
