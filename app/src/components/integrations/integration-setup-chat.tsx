import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { RoutineSetupChatBoard } from "../agent/routine-setup-chat-board";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";

interface Props {
  /** The agent that owns this setup chat (resolved by the section's hook). */
  agent: Agent;
  /**
   * The agent's live integration-setup draft, or null while it is still being
   * created (renders a calm loading state — never a dead screen).
   */
  activity: Activity | null;
  /**
   * Whether the surface that mounted this chat owns the visible screen. The
   * custom section stays mounted inside kept-alive views (the global page AND
   * every mounted screen), and only the visible instance may drive the SHARED
   * shell panel — two portals into one container would double-mount the chat.
   */
  active: boolean;
  /** Close the chat panel (the draft stays live, so the Continue-setup banner
   *  brings it back). Wired to the panel's close X and Escape. */
  onClose: () => void;
  /** The user says the integration is set up and working: retire the chat so
   *  the next "Add custom integration" starts fresh. */
  onDone: () => void;
}

/**
 * The custom-integration setup chat, rendered into the big shell-level panel
 * (`useShellDetailPanel`) — the EXACT right-hand panel the mission board and
 * the routine chat open, so the Integrations page stays visible on the left
 * while the agent runs the interview on the right (the Routines look; the
 * old inline-box embed buried the page under the chat).
 *
 * The guided chat is a real mission under the hood, but every board filters
 * it out — the shared {@link RoutineSetupChatBoard} does the AIBoard mount +
 * full `useAgentChatPanel` wiring, crucially `composerOverride`, which renders
 * the ask_user question card and the secure `request_credential` entry card
 * the interview depends on. It gets no `missionLabel` override, so the header
 * shows the default "Mission: {title}" — this IS a mission.
 */
export function IntegrationSetupChat({
  agent,
  activity,
  active,
  onClose,
  onDone,
}: Props) {
  const { t } = useTranslation("integrations");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();

  // The visible instance owns the shell panel for as long as the chat is open
  // (the section mounts this component only while it is); losing the surface
  // (tab/view switch) or closing releases it for the mission board.
  useEffect(() => {
    if (!active) return;
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [active, setPanelOpen]);

  // Escape closes the panel (the routines convention): a focused composer
  // gets the FIRST Escape to blur, the panel only the next one; Radix
  // menus/dialogs mark their own Escape handled.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      const editable =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (editable) {
        el.blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);

  // The panel div mounts only after setPanelOpen(true) lands — render nothing
  // for that frame (and always nothing while another surface owns the screen).
  if (!active || !panelContainer) return null;

  // Draft still being created: a slim dismissable header over a calm loading
  // state, portaled into the same panel the live chat will fill.
  if (!activity) {
    return createPortal(
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-background px-4 py-3 dark:bg-transparent">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {t("custom.setupChat.missionTitle")}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("custom.setupChat.close")}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("custom.setupChat.opening")}</span>
        </div>
      </div>,
      panelContainer,
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

  // The board renders its detail panel straight into the shell panel via
  // `panelContainer`; its own list never shows, so the board itself stays
  // hidden (the portal escapes the `hidden` wrapper). One mount, one panel.
  return (
    <div className="hidden">
      <RoutineSetupChatBoard
        agent={agent}
        activity={activity}
        sessionKey={sessionKey}
        panelContainer={panelContainer}
        onPanelClose={onClose}
        panelActions={doneButton}
      />
    </div>
  );
}
