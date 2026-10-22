import { Building2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMoveOutDestinations } from "../../hooks/use-move-out";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import type { Agent } from "../../lib/types";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import { ShareViaTeamFlow } from "../agent/share-via-team-flow";
import { SettingsRow } from "../settings/settings-row";

/**
 * "Move to another organization", with its flow. In the Personal space it
 * shares the AI Employee into a team; in a team space it moves it out to
 * another org the caller runs, Personal included, which stays open on a
 * locked org since that is how one empties.
 */
export function AgentSettingsOrgMove({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const personalSpace = usePersonalSpace();
  const destinations = useMoveOutDestinations();
  const [open, setOpen] = useState(false);
  // Which flow runs is fixed when it opens: the move itself switches the
  // space, and swapping flows mid-run would restart it from the picker.
  const [fromPersonal, setFromPersonal] = useState<boolean | null>(null);
  const [opened, setOpened] = useState<typeof destinations>(null);
  const offered =
    personalSpace || (destinations !== null && destinations.length > 0);
  const flowFromPersonal = fromPersonal ?? personalSpace;
  if (!offered && fromPersonal === null) return null;
  return (
    <>
      {offered && (
        <SettingsRow
          icon={Building2}
          title={t("agentSettings.manage.moveOrganization")}
          description={t(
            personalSpace
              ? "agentSettings.manage.moveOrganizationDescription"
              : "agentSettings.manage.moveOutDescription",
          )}
          onClick={() => {
            setFromPersonal(personalSpace);
            setOpened(destinations);
            setOpen(true);
          }}
        />
      )}
      {flowFromPersonal ? (
        <AgentShareSurfaces
          agent={agent}
          surface="inviteTeam"
          open={open}
          onOpenChange={setOpen}
        />
      ) : (
        <ShareViaTeamFlow
          agent={agent}
          open={open}
          onOpenChange={setOpen}
          mode={{
            kind: "move_out",
            destinations: opened ?? destinations ?? [],
          }}
        />
      )}
    </>
  );
}
