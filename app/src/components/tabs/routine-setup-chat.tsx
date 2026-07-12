import { Button } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import { RoutineSetupChatBoard } from "./routine-setup-chat-board";

interface Props extends TabProps {
  /** The routine's chat activity, or the draft create-chat for a brand-new
   *  one. Null while it's still being created (renders a loading fallback). */
  activity: Activity | null;
  /** Which chat this is — a routine's own chat or an unclaimed draft. Drives
   *  the header label without any string-equality guessing. */
  kind: "routine" | "draft";
  /** The routine's own name, for the "Routine: {name}" header. Unused when
   *  `kind` is "draft". */
  routineName?: string;
  /** Header label for a still-unclaimed draft chat. Defaults to the routine
   *  wording ("New routine"); the Reactions tab passes its own copy. */
  newLabel?: string;
  /** Header label for a claimed item's chat, already interpolated with its name
   *  ("Routine: X"). Defaults to the routine wording; Reactions passes its own. */
  itemLabel?: string;
  /** Return to the list. */
  onBack: () => void;
}

/**
 * The routine's chat — the ENTIRE tab content while a routine is open
 * (HOU first-principles rebuild). No side-by-side editor, no run history
 * list: this is the one surface for setting up a routine, changing it, and
 * finding out what it did.
 *
 * There is exactly ONE header, owned by the inner AIBoard detail panel (never
 * a second one stacked on top of it): the Back button rides in as its
 * `panelLeading` slot, to the left of the agent avatar, and the auto
 * "Mission: {title}" line is overridden to read "Routine: {name}" instead.
 *
 * The chat is a real mission under the hood (every board filters it out via
 * the routine-setup sentinel), but it never joins the app's shared mission
 * panel — this component owns its own full-page container instead.
 *
 * The chat is permanent (HOU-725): once a routine claims it via
 * `setup_activity_id`, reopening that routine resumes this same
 * conversation, so a finished chat is never auto-archived.
 */
export function RoutineSetupChat({
  agent,
  agentDef,
  activity,
  kind,
  routineName,
  newLabel,
  itemLabel,
  onBack,
}: Props) {
  const { t } = useTranslation("routines");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Escape returns to the list. Radix menus/dialogs mark their own Escape
  // handled (`defaultPrevented`) — leave those alone. A focused composer gets
  // the FIRST Escape to blur (app convention), the list only on the next one.
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
      onBack();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const backButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onBack}
      aria-label={t("chat.back")}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );

  // Draft still being created: never a dead screen. A slim header (same shape
  // as the panel's) keeps the Back button reachable over a calm loading state.
  if (!activity) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="px-4 py-3 border-b border-border">
          <div className="max-w-3xl mx-auto w-full flex items-center gap-3">
            {backButton}
          </div>
        </div>
        <div className="min-h-0 flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("chat.opening")}</span>
        </div>
      </div>
    );
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;
  const missionLabel =
    kind === "draft"
      ? (newLabel ?? t("chat.newRoutineTitle"))
      : (itemLabel ?? t("chat.routineLabel", { name: routineName ?? "" }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={setContainer} className="min-h-0 flex-1" />
      <div className="hidden">
        <RoutineSetupChatBoard
          agent={agent}
          agentDef={agentDef}
          activity={activity}
          sessionKey={sessionKey}
          panelContainer={container}
          missionLabel={missionLabel}
          panelLeading={backButton}
        />
      </div>
    </div>
  );
}
