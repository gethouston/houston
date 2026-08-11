import { useEffect, useMemo, useState } from "react";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import type { RawConversation } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useEmailSetupCompleted } from "./missions/email-mission-setup";
import { feedShowsTurnError } from "./missions/email-skip";

/** Give up closing a lingering panel after this many 300ms attempts: a board
 *  without a registered closer must not spin the lesson forever — the step
 *  proceeds with the panel as-is instead. */
const CLOSE_ATTEMPTS_MAX = 10;
/** After this long on the watch beat with no marker and no error, offer the
 *  way onward anyway. */
const EMAIL_WAIT_PATIENCE_MS = 120_000;

/**
 * The send-step's world discipline, extracted from `use-in-app-onboarding`:
 *
 * - Panel: the taught mechanic is the New task CLICK, so a lingering chat
 *   panel is closed (through the board's registered closer, bounded) before
 *   panel-opens count as the user's own.
 * - Baseline: mission ids snapshot only once the cross-agent sweep has
 *   SETTLED for the current roster — an empty in-flight sweep would make
 *   every pre-existing mission read as "just sent".
 * - The guided mission: the first non-baseline row, required to belong to
 *   the tutorial-created agent when there is one; its feed feeds the
 *   email-sent marker watch and the stuck detection (turn error, or a
 *   patience timeout).
 */
export function useSendMissionDiscipline(args: {
  active: boolean;
  watching: boolean;
  missionRows: readonly RawConversation[];
  missionRowsSettled: boolean;
  emailAgentPath: string | null;
}) {
  const { active, watching, missionRows, missionRowsSettled, emailAgentPath } =
    args;
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const [panelReady, setPanelReady] = useState(false);
  const [awaitingBaseline, setAwaitingBaseline] = useState(false);
  const [baselineIds, setBaselineIds] = useState<Set<string> | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  // Close any lingering panel, bounded; then panel-opens are the user's.
  useEffect(() => {
    if (!active || panelReady) return;
    if (!missionPanelOpen) {
      setPanelReady(true);
      return;
    }
    let attempts = 0;
    const close = () => {
      useUIStore.getState().onPanelClose?.();
      attempts += 1;
      if (attempts >= CLOSE_ATTEMPTS_MAX) {
        window.clearInterval(id);
        setPanelReady(true);
      }
    };
    close();
    const id = window.setInterval(close, 300);
    return () => window.clearInterval(id);
  }, [active, panelReady, missionPanelOpen]);

  // Baseline only from a settled sweep.
  useEffect(() => {
    if (!awaitingBaseline || !missionRowsSettled) return;
    setBaselineIds(new Set(missionRows.map((r) => r.id)));
    setAwaitingBaseline(false);
  }, [awaitingBaseline, missionRowsSettled, missionRows]);

  const newMissionRow = useMemo(
    () =>
      baselineIds
        ? missionRows.find(
            (r) =>
              !baselineIds.has(r.id) &&
              (emailAgentPath === null || r.agent_path === emailAgentPath),
          )
        : undefined,
    [baselineIds, missionRows, emailAgentPath],
  );
  const feed = useConversationFeed(
    newMissionRow?.agent_path,
    newMissionRow?.session_key,
  );
  const emailSent = useEmailSetupCompleted(feed);

  // The watch beat's patience: a turn error, or simply too long.
  useEffect(() => {
    if (!watching) {
      setWaitedTooLong(false);
      return;
    }
    const id = window.setTimeout(
      () => setWaitedTooLong(true),
      EMAIL_WAIT_PATIENCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [watching]);
  const emailStuck = watching && (feedShowsTurnError(feed) || waitedTooLong);

  return {
    userPanelOpen: panelReady && missionPanelOpen,
    missionSent: newMissionRow !== undefined,
    emailSent,
    emailStuck,
    /** Call on entering the send step. */
    begin: () => {
      setPanelReady(false);
      setBaselineIds(null);
      setAwaitingBaseline(true);
    },
  };
}
