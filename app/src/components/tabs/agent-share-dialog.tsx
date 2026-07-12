import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import type { AgentAssignment, OrgMember } from "@houston-ai/engine-client";
import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import {
  addableMembers,
  addPerson,
  applyShareAction,
  buildSharePeople,
  needsSelfLockoutConfirm,
  type ShareAction,
  type SharePerson,
} from "./agent-access-model";
import { AgentShareAddPeople } from "./agent-share-add-people";
import { AgentSharePersonRow } from "./agent-share-person-row";
import { useShareAgent } from "./use-share-agent";

/**
 * Google Drive-style Share sheet for an agent. Lists the people with access,
 * each with a Manager / Can use / Remove control, plus a member picker to add
 * someone. Backed by `setAgentAssignments` v2 (`{userId, access}[]`) with an
 * optimistic store patch + rollback (see `useShareAgent`). Render is gated by
 * the caller (`canShowAgentShareBlock`); the gateway is the real enforcer.
 */
export function AgentShareDialog({
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
  const share = useShareAgent();
  // A self-lockout action (remove/demote yourself) held for confirmation.
  const [pending, setPending] = useState<{
    person: SharePerson;
    action: ShareAction;
  } | null>(null);

  const selfId = session?.uid ?? null;
  const members = org.data?.members ?? [];
  const people = buildSharePeople({ agent, members, selfId });
  const candidates = addableMembers(members, people);
  const { profiles } = useUserProfiles(people.map((p) => p.userId));

  const write = (assignments: AgentAssignment[]) =>
    share.mutate({ agentId: agent.id, assignments });

  const handleAction = (person: SharePerson, action: ShareAction) => {
    if (needsSelfLockoutConfirm(person, action)) {
      setPending({ person, action });
      return;
    }
    write(applyShareAction(people, person.userId, action));
  };

  const handleAdd = (member: OrgMember) => write(addPerson(people, member));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("share.title", { name: agent.name })}</DialogTitle>
          <DialogDescription>{t("share.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <AgentShareAddPeople
            candidates={candidates}
            disabled={share.isPending}
            onAdd={handleAdd}
          />

          {org.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : people.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink/10 px-4 py-8 text-center">
              <Users className="mx-auto mb-2 size-6 text-ink-muted" />
              <p className="text-sm font-medium text-ink">
                {t("share.empty.title")}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {t("share.empty.body")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {people.map((person) => (
                <AgentSharePersonRow
                  key={person.userId}
                  person={person}
                  avatarUrl={avatarUrlFromProfiles(profiles, person.userId)}
                  disabled={share.isPending}
                  onAction={(action) => handleAction(person, action)}
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-muted">
            {t("share.conversationNote")}
          </p>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={t("share.selfLockout.title")}
        description={t("share.selfLockout.description")}
        confirmLabel={t("share.selfLockout.confirm")}
        cancelLabel={t("share.selfLockout.cancel")}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) write(applyShareAction(people, p.person.userId, p.action));
        }}
      />
    </Dialog>
  );
}
