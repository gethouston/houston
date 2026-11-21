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

  const selfId = session?.uid ?? null;
  const members = org.data?.members ?? [];
  const people = withViewer(buildSharePeople({ agent, members, selfId }), {
    userId: selfId,
    email: session?.email,
  });
  const { profiles } = useUserProfiles(people.map((p) => p.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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

          <p className="text-xs text-ink-muted">
            {t("share.conversationNote")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
