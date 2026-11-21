import { Skeleton } from "@houston-ai/core";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useSession } from "../../hooks/use-session";
import { hasSpaces } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { agentShareSurface } from "../agent/agent-access-model";
import { AccessChoice } from "../agent/agent-admin/access-choice.tsx";
import type { AccessMode } from "../agent/agent-admin/agent-admin-row-values.ts";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import { useShareAgent } from "../agent/use-share-agent";
import { CreateOrganizationInviteEmpty } from "../organization/create-organization-invite-empty";
import {
  agentAccessMode,
  agentPeopleCount,
  canChooseAgentAccess,
  everyoneAssignments,
  everyoneSwitchConfirm,
  materializeRoster,
} from "./agent-people-choice.ts";
import {
  AgentPeopleConfirm,
  type PeopleConfirmKind,
} from "./agent-people-confirm.tsx";
import { AgentPeopleTab } from "./agent-people-tab.tsx";
import { AgentSettingsPeopleHero } from "./agent-settings-people-hero.tsx";

function PeopleSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-9 w-full max-w-md rounded-full" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-6 grid grid-cols-1 gap-1">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </div>
  );
}

export function AgentSettingsPeople({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const headingId = useId();
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const org = useOrg(true);
  const members = org.data?.members ?? [];
  const share = useShareAgent("agent_settings_people");
  const [confirm, setConfirm] = useState<PeopleConfirmKind | null>(null);
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const [shareOpen, setShareOpen] = useState(false);
  const shareSurface = agentShareSurface(capabilities, agent, personalSpace);
  const personalSpacesHost = personalSpace && hasSpaces(capabilities);
  const showShare = shareSurface === "manage" && !personalSpacesHost;

  const mode = agentAccessMode(agent);
  const roster = { agent, members, selfId };
  const peopleCount = agentPeopleCount(roster);

  const write = (assignments: ReturnType<typeof everyoneAssignments>) =>
    share.mutate({ agentId: agent.id, members, assignments });

  const commit = (kind: PeopleConfirmKind) =>
    write(
      kind === "specific" ? materializeRoster(roster) : everyoneAssignments(),
    );

  const handleChoice = (next: AccessMode) => {
    if (next === "picked") {
      setConfirm("specific");
      return;
    }
    const gate = everyoneSwitchConfirm(roster);
    if (gate === "none") {
      write(everyoneAssignments());
      return;
    }
    setConfirm(gate === "selfLockout" ? "selfLockout" : "everyone");
  };

  if (personalSpacesHost) {
    return (
      <div className="w-full">
        <AgentSettingsPeopleHero
          titleId={headingId}
          showShare={false}
          onShare={() => undefined}
        />
        <CreateOrganizationInviteEmpty />
      </div>
    );
  }

  return (
    <div className="w-full">
      <AgentSettingsPeopleHero
        titleId={headingId}
        showShare={showShare}
        onShare={() => setShareOpen(true)}
      />

      {org.isLoading ? (
        <PeopleSkeleton />
      ) : (
        <>
          {canChooseAgentAccess(members) && (
            <AccessChoice
              labelledBy={headingId}
              value={mode}
              disabled={share.isPending}
              onChange={handleChoice}
              options={[
                {
                  value: "any",
                  label: t("agentSettings.people.anyLabel"),
                  description: t("agentSettings.people.anyDesc"),
                },
                {
                  value: "picked",
                  label: t("agentSettings.people.pickedLabel"),
                  description: t("agentSettings.people.pickedDesc"),
                },
              ]}
            />
          )}

          <div className="mt-6">
            <AgentPeopleTab
              agent={agent}
              members={members}
              share={share}
              readOnly={mode === "any"}
              note={
                mode === "any"
                  ? t("agentSettings.people.everyoneNote")
                  : undefined
              }
            />
          </div>
        </>
      )}

      <AgentShareSurfaces
        agent={agent}
        surface={shareSurface}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <AgentPeopleConfirm
        kind={confirm}
        count={peopleCount}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const kind = confirm;
          setConfirm(null);
          if (kind) commit(kind);
        }}
      />
    </div>
  );
}
