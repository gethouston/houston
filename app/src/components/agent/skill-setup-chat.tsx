import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { skillChatTurnContext } from "../../lib/skill-chat-prompts";
import type { Agent } from "../../lib/types";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
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
  /** The skill's directory slug — pins the per-turn model context to the
   *  bound skill. Unused for drafts (nothing exists to pin yet). */
  skillSlug?: string;
  /** Close the pane and clear the selection (the catalog stays put). Wired
   *  to the panel chrome's close X and Escape. */
  onClose: () => void;
  /** The manual escape hatch (HOU-791 keeps it): opens the raw markdown edit
   *  modal for THIS skill. Only offered on an installed skill's chat. */
  onEditManually?: () => void;
}

/**
 * A custom skill's setup chat, rendered in the SHELL'S right-hand detail
 * panel — the same split the Routines section and the mission board use: the
 * Skills catalog stays visible on the left while the conversation opens as
 * its own screen card on the right. Mounting this component IS what opens
 * the panel (and unmounting closes it), so every host — the agent settings
 * page's Skills section and the global Skills page — gets the split without
 * extra wiring.
 *
 * The guided chat is a real mission under the hood, but every board filters
 * it out via the skill-setup sentinel — its only home is this panel. The
 * shared {@link RoutineSetupChatBoard} does the AIBoard mount + full
 * `useAgentChatPanel` wiring — crucially `composerOverride`, which renders
 * the ask_user question cards the create interview depends on.
 */
export function SkillSetupChat({
  agent,
  activity,
  kind,
  skillName,
  skillSlug,
  onClose,
  onEditManually,
}: Props) {
  const { t } = useTranslation("skills");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();

  // Mount = panel open, unmount = panel closed. Same contract the Routines
  // chat keeps, centralized here so both Skills hosts share it.
  useEffect(() => {
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [setPanelOpen]);

  // Escape closes the panel (routines parity). Radix menus/dialogs mark their
  // own Escape handled (`defaultPrevented`); a focused composer gets the FIRST
  // Escape to blur (app convention), the pane only on the next one.
  useEffect(() => {
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
  }, [onClose]);

  const missionLabel =
    kind === "draft"
      ? t("setupChat.missionTitle")
      : t("setupChat.skillLabel", { name: skillName ?? "" });

  // Draft still being created, or a skill chat still loading: a slim header
  // (same shape + close as the live panel's) keeps the panel dismissable
  // while it settles — portaled into the shell panel like the live board, so
  // the pre-model state shares the same surface.
  if (!activity) {
    const surface = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-background px-4 py-3 dark:bg-transparent">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {missionLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("setupChat.close")}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("setupChat.opening")}</span>
        </div>
      </div>
    );
    return panelContainer ? createPortal(surface, panelContainer) : null;
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
        missionLabel={missionLabel}
        panelActions={editManuallyButton}
        onPanelClose={onClose}
        // Every send re-asserts which skill this chat manages — the model
        // must never have to remember it from the kickoff alone (it was
        // observed asking "which skill?" inside a skill's own chat).
        promptContext={
          kind === "skill" && skillSlug
            ? skillChatTurnContext({
                slug: skillSlug,
                displayName: skillName ?? "",
              })
            : undefined
        }
      />
    </div>
  );
}
