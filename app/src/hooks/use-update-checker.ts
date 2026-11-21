import { ownTurnInFlight } from "@houston/engine-adapter";
import { useCallback, useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { currentAppVersion } from "../lib/app-version";
import { isRemoteEngine } from "../lib/engine";
import { showUpdateCheckStuckToast } from "../lib/update-check-toast";
import {
  nextCheckFailureStreak,
  shouldRecheckOnFocus,
  UPDATE_CHECK_INTERVAL_MS,
  updateCheckJustStuck,
} from "../lib/update-policy";
import {
  type AbsenceEvent,
  type AbsenceState,
  absenceStep,
  draftPending,
  initialAbsence,
  type ReturnInputs,
  returnAction,
  returnLossHold,
  windowInFront,
} from "../lib/update-return";
import { useDraftStore } from "../stores/drafts";
import { useInteractionDraftStore } from "../stores/interaction-drafts";
import { useUpdateMachine } from "./use-update-machine";

export type {
  InstallSource,
  UpdateInfo,
  UpdateStatus,
} from "./use-update-machine";

function lossGates(): Pick<ReturnInputs, "turnInFlight" | "draftPending"> {
  return {
    turnInFlight: ownTurnInFlight(),
    draftPending: draftPending(
      useDraftStore.getState().drafts,
      useInteractionDraftStore.getState().parked,
    ),
  };
}
const returnHold = () => returnLossHold(lossGates());

export function useUpdateChecker() {
  const {
    status,
    currentStatus,
    runCheck,
    download,
    installAndRelaunch,
    relaunchInstalledApp,
  } = useUpdateMachine({ returnHold });
  const lastCheckAtRef = useRef<number | null>(null);
  const failureStreakRef = useRef(0);
  const absenceRef = useRef<AbsenceState>(initialAbsence(Date.now()));

  const check = useCallback(async () => {
    lastCheckAtRef.current = Date.now();
    const { outcome, message } = await runCheck();
    failureStreakRef.current = nextCheckFailureStreak(
      failureStreakRef.current,
      outcome,
    );
    if (updateCheckJustStuck(failureStreakRef.current)) {
      showUpdateCheckStuckToast(
        message ?? "unknown check failure",
        failureStreakRef.current,
        currentAppVersion(),
      );
    }
  }, [runCheck]);

  const onReturn = useCallback(() => {
    const action = returnAction({
      status: currentStatus(),
      engineRemote: isRemoteEngine(),
      ...lossGates(),
    });
    if (action.kind === "install") void installAndRelaunch("return");
    else if (action.kind === "hold") {
      analytics.track("update_return_held", { reason: action.reason });
    } else void check();
  }, [check, currentStatus, installAndRelaunch]);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (status.state !== "available") return;
    if (status.info.origin === "launch") void installAndRelaunch("launch");
    else void download("poll");
  }, [status, download, installAndRelaunch]);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    void check();
    const track = (event: AbsenceEvent): boolean => {
      const step = absenceStep(absenceRef.current, event);
      absenceRef.current = step.state;
      if (step.returned) onReturn();
      return step.returned;
    };
    const tick = () => {
      const event: AbsenceEvent = {
        kind: "tick",
        at: Date.now(),
        focused: windowInFront(document),
      };
      if (!track(event)) void check();
    };
    const interval = setInterval(tick, UPDATE_CHECK_INTERVAL_MS);
    const recheckIfDue = () => {
      if (shouldRecheckOnFocus(lastCheckAtRef.current, Date.now())) {
        void check();
      }
    };
    const focus = () => {
      if (!track({ kind: "focus", at: Date.now() })) recheckIfDue();
    };
    const blur = () => {
      track({ kind: "blur", at: Date.now() });
    };
    const visibility = () => {
      const at = Date.now();
      track(
        document.visibilityState === "hidden"
          ? { kind: "hidden", at }
          : { kind: "visible", at, focused: windowInFront(document) },
      );
    };
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("online", recheckIfDue);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", recheckIfDue);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, onReturn]);

  return { status, installAndRelaunch, relaunchInstalledApp };
}
