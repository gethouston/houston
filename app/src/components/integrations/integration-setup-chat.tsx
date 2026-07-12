import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent, AgentDefinition } from "../../lib/types";
import { RoutineSetupChatBoard } from "../tabs/routine-setup-chat-board";

interface Props {
  /** The agent that owns this setup chat (resolved by the section's hook). */
  agent: Agent;
  agentDef: AgentDefinition | null;
  /**
   * The agent's live integration-setup draft, or null while it is still being
   * created (renders a calm loading state — never a dead screen).
   */
  activity: Activity | null;
  /** Return to the Custom-integrations section (closes the inline chat; the
   *  draft stays live, so the Continue-setup banner brings it back). */
  onClose: () => void;
  /** The user says the integration is set up and working: retire the chat so
   *  the next "Add custom integration" starts fresh. */
  onDone: () => void;
}

/**
 * The custom-integration setup chat, rendered INLINE inside the Custom
 * integrations section (mirrors main's `RoutineSetupChat`). The guided chat is a
 * real mission under the hood, but every board filters it out — so this owns its
 * OWN local container div and portals the chat's detail panel into it (never the
 * app-wide mission panel), keeping the chat embedded on the Integrations page.
 *
 * The shared {@link RoutineSetupChatBoard} does the AIBoard mount + full
 * `useAgentChatPanel` wiring — crucially `composerOverride`, which renders the
 * ask_user question card and the secure `request_credential` entry card the
 * interview depends on. It gets no `missionLabel` override, so the header shows
 * the default "Mission: {title}" — this IS a mission.
 */
export function IntegrationSetupChat({
  agent,
  agentDef,
  activity,
  onClose,
  onDone,
}: Props) {
  const { t } = useTranslation("integrations");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // The Integrations page is global, so the catalog may not resolve a def for
  // this agent's (fabricated) configId. RoutineSetupChatBoard needs a non-null
  // def only for its agent-modes list, which a setup chat never uses —
  // synthesize a minimal one so the send path still compiles and runs.
  const resolvedDef = useMemo<AgentDefinition>(
    () =>
      agentDef ?? {
        config: { id: agent.configId, name: agent.name, description: "" },
        source: "builtin",
      },
    [agentDef, agent.configId, agent.name],
  );

  const backButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClose}
      aria-label={t("custom.setupChat.back")}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );

  // Draft still being created: keep the Back button reachable over a calm
  // loading state rather than flashing an empty box.
  if (!activity) {
    return (
      <div className="mb-4 flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-line">
        <div className="border-line border-b px-4 py-3">{backButton}</div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("custom.setupChat.opening")}</span>
        </div>
      </div>
    );
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;

  // The user's "the integration works" exit: retires the chat (the next Add
  // starts fresh) — always visible in the header, never behind a menu.
  const doneButton = (
    <Button variant="outline" size="sm" onClick={onDone}>
      {t("custom.setupChat.done")}
    </Button>
  );

  return (
    <div className="mb-4 flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-line">
      <div ref={setContainer} className="min-h-0 flex-1" />
      <div className="hidden">
        <RoutineSetupChatBoard
          agent={agent}
          agentDef={resolvedDef}
          activity={activity}
          sessionKey={sessionKey}
          panelContainer={container}
          panelLeading={backButton}
          panelActions={doneButton}
        />
      </div>
    </div>
  );
}
