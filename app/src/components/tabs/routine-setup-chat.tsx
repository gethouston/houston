import { ChatInput } from "@houston-ai/chat";
import type { Activity, Routine } from "@houston-ai/engine-client";
import { Loader2, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useBoardLabels } from "../board/use-board-labels";
import { RoutineActivationChip } from "./routine-activation-chip";
import { RoutineSetupChatBoard } from "./routine-setup-chat-board";

interface Props extends TabProps {
  /** The routine's chat activity, or the draft create-chat for a brand-new
   *  one. Null while it's still being created, or during the pre-model intake
   *  (renders the calm empty chat surface instead of the live board). */
  activity: Activity | null;
  /** Which chat this is — a routine's own chat, an unclaimed draft, or the
   *  pre-model create intake. Drives the header label and the pre-activity
   *  surface without any string-equality guessing. */
  kind: "routine" | "draft" | "intake";
  /** The routine's own name, for the "Routine: {name}" header. Unused when
   *  `kind` is "draft"/"intake". */
  routineName?: string;
  /** The open routine itself (absent for a draft). When it carries a trigger
   *  binding, the header shows its live activation health right here. */
  routine?: Routine;
  /** Close the panel and clear the selection (the list stays put). Wired to the
   *  chat chrome's close X, Escape, and the intake cards' own dismiss. */
  onClose: () => void;
  /** The shell-level panel node this chat portals into (workspace-shell's
   *  sibling panel, the SAME one the Activity board opens). Null until the
   *  panel mounts — the surface renders nothing until it exists. */
  panelContainer: HTMLElement | null;
  /** Intake only: the locally-driven question cards, floated over the composer
   *  exactly where the agent's real ask_user cards float. */
  intakeOverlay?: ReactNode;
  /** Intake only: sending a composer message is the escape hatch — it abandons
   *  the cards and hands the typed text to the agent as the intent. Omit to
   *  leave the composer busy (a draft that is still being created). */
  onIntakeSend?: (text: string) => void;
}

/**
 * The selected routine's chat — rendered into the big shell-level panel
 * (`panelContainer`), the EXACT panel the Activity board opens. Each routine IS
 * a chat: this is the one surface for setting up a routine, changing it, and
 * finding out what it did. No side-by-side editor, no run-history list.
 *
 * There is exactly ONE header, owned by the inner AIBoard detail panel (never a
 * second one stacked on top of it): its close X deselects (closes the panel, the
 * list never disappears), and the auto "Mission: {title}" line is overridden to
 * read "Routine: {name}". Pre-activity states (intake, a creating draft, a
 * loading routine) render a matching slim header with the same close X, portaled
 * into that same panel.
 *
 * The chat is a real mission under the hood (every board filters it out via the
 * routine-setup sentinel); it joins the app's shared shell panel just like the
 * mission board, so both surfaces are one UI path.
 *
 * The chat is permanent (HOU-725): once a routine claims it via
 * `setup_activity_id`, reopening that routine resumes this same conversation, so
 * a finished chat is never auto-archived.
 */
export function RoutineSetupChat({
  agent,
  agentDef,
  activity,
  kind,
  routineName,
  routine,
  onClose,
  intakeOverlay,
  onIntakeSend,
  panelContainer,
}: Props) {
  const { t } = useTranslation("routines");
  const { composerLabels } = useBoardLabels();

  // Escape closes the panel. Radix menus/dialogs mark their own Escape handled
  // (`defaultPrevented`) — leave those alone. A focused composer gets the FIRST
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
        (el as HTMLElement).blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("chat.close")}
      className="size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 transition-colors shrink-0"
    >
      <X className="size-4" strokeWidth={1.75} />
    </button>
  );

  // No activity yet. A slim header (same shape + close as the panel's) keeps the
  // panel dismissable while it settles. Portaled into the shell panel like the
  // live board below, so the pre-model states share the same surface.
  if (!activity) {
    const slimHeader = (title?: string) => (
      <div className="shrink-0 bg-background px-4 py-3 dark:bg-transparent">
        <div className="max-w-3xl mx-auto w-full flex items-center gap-3">
          {title && (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {title}
            </span>
          )}
          {!title && <div className="min-w-0 flex-1" />}
          {closeButton}
        </div>
      </div>
    );

    // Opening an EXISTING routine's chat is a real load, so a calm spinner.
    const surface =
      kind === "routine" ? (
        <div className="flex h-full min-h-0 flex-col">
          {slimHeader()}
          <div className="min-h-0 flex-1 flex items-center justify-center gap-2 text-ink-muted">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">{t("chat.opening")}</span>
          </div>
        </div>
      ) : (
        // Intake, or a draft still being created: a calm empty chat surface, no
        // shimmer. Intake floats its question cards over the composer (the
        // escape hatch); a creating draft leaves the composer busy, matching the
        // agent's imminent first turn, so the surface never changes shape at
        // handoff.
        <div className="flex h-full min-h-0 flex-col">
          {slimHeader(t("chat.newRoutineTitle"))}
          <div className="min-h-0 flex-1" />
          {intakeOverlay && (
            <div className="shrink-0 px-4 pt-2">
              <div className="max-w-3xl mx-auto">{intakeOverlay}</div>
            </div>
          )}
          <ChatInput
            onSend={async (text) => onIntakeSend?.(text)}
            status={onIntakeSend ? "ready" : "submitted"}
            placeholder={t("chat.intakePlaceholder")}
            labels={composerLabels}
            onNotice={(message) =>
              useUIStore.getState().addToast({ title: message })
            }
          />
        </div>
      );

    return panelContainer ? createPortal(surface, panelContainer) : null;
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;
  const missionLabel =
    kind === "draft"
      ? t("chat.newRoutineTitle")
      : t("chat.routineLabel", { name: routineName ?? "" });

  // A trigger-bound routine shows its live activation right in the one header:
  // checking -> activating -> active, or an alert with the reason + Reconnect.
  const activationChip =
    kind === "routine" && routine?.trigger ? (
      <RoutineActivationChip
        agentId={agent.id}
        routineId={routine.id}
        trigger={routine.trigger}
      />
    ) : undefined;

  // The board renders its detail panel straight into the shell panel via
  // `panelContainer`; its own list never shows, so the board itself stays
  // hidden (the portal escapes the `hidden` wrapper). One mount, one panel.
  return (
    <div className="hidden">
      <RoutineSetupChatBoard
        agent={agent}
        agentDef={agentDef}
        activity={activity}
        sessionKey={sessionKey}
        panelContainer={panelContainer}
        missionLabel={missionLabel}
        onPanelClose={onClose}
        panelActions={activationChip}
      />
    </div>
  );
}
