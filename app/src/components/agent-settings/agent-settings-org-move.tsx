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
  if (!personalSpace && (destinations === null || destinations.length === 0))
    return null;
  return (
    <>
      <SettingsRow
        icon={Building2}
        title={t("agentSettings.manage.moveOrganization")}
        description={t(
          personalSpace
            ? "agentSettings.manage.moveOrganizationDescription"
            : "agentSettings.manage.moveOutDescription",
        )}
        onClick={() => setOpen(true)}
      />
      {personalSpace ? (
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
          mode={{ kind: "move_out", destinations: destinations ?? [] }}
        />
      )}
    </>
  );
}
