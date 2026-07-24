import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent, AgentDefinition } from "../../lib/types";
import { RoutineSetupChatBoard } from "./routine-setup-chat-board";

interface Props {
  /** The agent that owns this setup chat. */
  agent: Agent;
  /**
   * The chat's activity — a skill's persistent chat or an unclaimed draft —
   * or null while it is still being created / loading (renders a calm
   * loading state, never a dead screen).
   */
  activity: Activity | null;
  /** Which chat this is: an installed skill's own chat, or a create draft.
   *  Drives the header label and the Edit-manually affordance. */
  kind: "skill" | "draft";
  /** The skill's display name, for the "Skill: {name}" header. Unused for
   *  drafts (the header shows the create title). */
  skillName?: string;
  /** Close the pane and clear the selection (the catalog stays put). Wired
   *  to the panel chrome's close X. */
  onClose: () => void;
  /** The manual escape hatch (HOU-791 keeps it): opens the raw markdown edit
   *  modal for THIS skill. Only offered on an installed skill's chat. */
  onEditManually?: () => void;
}

/**
 * A custom skill's setup chat, rendered INLINE inside the Skills section
 * (HOU-791 — mirrors the custom-integration setup chat). The guided chat is a
 * real mission under the hood, but every board filters it out via the
 * skill-setup sentinel — so this owns its OWN local container div and portals
 * the chat's detail panel into it, keeping the chat embedded on the Skills
 * page.
 *
 * The shared {@link RoutineSetupChatBoard} does the AIBoard mount + full
 * `useAgentChatPanel` wiring — crucially `composerOverride`, which renders the
 * ask_user question cards the create interview depends on. The auto
 * "Mission: {title}" header line is overridden to read "Skill: {name}" (or
 * the create title for a draft).
 */
export function SkillSetupChat({
  agent,
  activity,
  kind,
  skillName,
  onClose,
  onEditManually,
}: Props) {
  const { t } = useTranslation("skills");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // The Skills section has no ambient AgentDefinition. RoutineSetupChatBoard
  // needs one only for its agent-modes list, which a setup chat never uses —
  // synthesize a minimal def so the send path still compiles and runs (the
  // same shim the custom-integration setup chat uses).
  const agentDef = useMemo<AgentDefinition>(
    () => ({
      config: { id: agent.configId, name: agent.name, description: "" },
      source: "builtin",
    }),
    [agent.configId, agent.name],
  );

  const missionLabel =
    kind === "draft"
      ? t("setupChat.missionTitle")
      : t("setupChat.skillLabel", { name: skillName ?? "" });

  // Draft still being created, or a skill chat still loading: keep the pane
  // shape stable over a calm loading state rather than flashing an empty box.
  if (!activity) {
    return (
      <div className="flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-line">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("setupChat.opening")}</span>
        </div>
      </div>
    );
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;

  // The manual editor stays one click away — always visible in the header,
  // never behind a menu (no hover-only affordances).
  const editManuallyButton =
    kind === "skill" && onEditManually ? (
      <Button variant="outline" size="sm" onClick={onEditManually}>
        {t("setupChat.editManually")}
      </Button>
    ) : undefined;

  return (
    <div className="flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-line">
      <div ref={setContainer} className="min-h-0 flex-1" />
      <div className="hidden">
        <RoutineSetupChatBoard
          agent={agent}
          agentDef={agentDef}
          activity={activity}
          sessionKey={sessionKey}
          panelContainer={container}
          missionLabel={missionLabel}
          panelActions={editManuallyButton}
          onPanelClose={onClose}
        />
      </div>
    </div>
  );
}
