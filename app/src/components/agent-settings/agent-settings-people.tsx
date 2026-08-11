import { Skeleton } from "@houston-ai/core";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useSession } from "../../hooks/use-session";
import type { Agent } from "../../lib/types";
import { agentShareSurface } from "../agent/agent-access-model";
import { AccessChoice } from "../agent/agent-admin/access-choice.tsx";
import type { AccessMode } from "../agent/agent-admin/agent-admin-row-values.ts";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import { useShareAgent } from "../agent/use-share-agent";
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

/** Mirrors the final layout (control pill, its hint line, three rows) so the roster never jumps in. */
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

/**
 * The People section of the agent settings page: the team-wide access question
 * on top, the per-person roster below.
 *
 * The choice is the same always-visible {@link AccessChoice} segmented control
 * the app + model ceilings use, wired to the real everyone-agent semantics via
 * `agent-people-choice` (empty assignee set = everyone; an explicit set = only
 * those people). BOTH directions are confirm-gated, because both replace the
 * whole roster in one write: switching to Everyone says what it discards
 * (and warns destructively when the viewer is discarding their OWN Manager
 * grant), switching to specific people says how many it is freezing and that
 * future teammates are no longer included. Writes go through ONE shared
 * optimistic {@link useShareAgent} — the same instance the roster rows use, so
 * one in-flight write disables every control here and two set-replaces can
 * never race.
 *
 * In "Everyone" mode the roster renders STATIC: per-person levels are not the
 * agent's state while the sentinel is set, and a live control there would
 * silently materialize the roster (the mirror of the confirm-gated switch).
 * This follows the `AllowlistEditor` idiom, which likewise stops offering
 * per-item controls in its "any" mode.
 *
 * The section owns the org query, so the roster refetches on mount when stale
 * and the body waits behind a skeleton until it lands. The choice itself hides
 * until the roster is readable ({@link canChooseAgentAccess}): with no members
 * to expand, "Only specific people" would write the empty set and mean the
 * opposite of its label.
 */
export function AgentSettingsPeople({
  agent,
  readOnly = false,
}: {
  agent: Agent;
  /** View-only: the choice is disabled and the roster renders without controls. */
  readOnly?: boolean;
}) {
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
  // The agent's ONE Share affordance: it invites people, so it lives on the
  // People section. "view" is deliberately not offered — this pane already
  // lists who has access, so the read-only dialog would say it twice.
  const shareSurface = agentShareSurface(capabilities, agent, personalSpace);
  const showShare = shareSurface === "manage" || shareSurface === "inviteTeam";

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
              disabled={readOnly || share.isPending}
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
              readOnly={readOnly || mode === "any"}
              note={
                readOnly
                  ? t("permissions.agentPeople.readOnlyHint")
                  : mode === "any"
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
