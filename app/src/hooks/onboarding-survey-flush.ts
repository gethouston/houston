// The LIVE WIRING of the onboarding survey's gateway push: which ports the
// push runs over on a real device, and the catch-up that pushes a record whose
// own push never landed. Split from `use-onboarding-survey` so that hook reads
// as "the record and its four saves"; the convergence rules themselves — who
// owns a push, in what order pushes land, what a failed one is still owed —
// live in `../lib/onboarding-survey-push`, React-free and driven by app/tests.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { OnboardingSurveyPreference } from "../lib/onboarding-survey";
import { liveSurveyStorePorts } from "../lib/onboarding-survey-ports";
import {
  createSurveyPusher,
  type SurveyPusher,
} from "../lib/onboarding-survey-push";
import { persistSurveyPreference } from "../lib/onboarding-survey-store";
import {
  owesGatewayCatchUp,
  syncOnboardingToGateway,
} from "../lib/onboarding-sync";

/** Where the record lives in the query cache — shared with its owning hook. */
export const surveyKey = (uid: string | null) =>
  ["onboarding-survey", uid] as const;

/**
 * ONE instance per app (App owns the survey hook that owns this): the catch-up
 * is a side effect per instance, so a second live instance would double every
 * recovery PUT.
 */
export function useSurveyGatewaySync(input: {
  uid: string | null;
  /** Whether this deployment has an account store to sync with at all. */
  gateway: boolean;
  survey: OnboardingSurveyPreference | null;
}): SurveyPusher {
  const { uid, gateway, survey } = input;
  const qc = useQueryClient();

  // A ref rather than `useMemo`: the pusher carries the claim on the push in
  // flight, and React only promises a memo as a performance hint — dropping
  // one mid-push would tell the catch-up nobody owns that record and earn it a
  // duplicate PUT. Rebuilt only when the ports themselves change identity.
  const live = useRef<{ key: string; pusher: SurveyPusher } | null>(null);
  const key = `${gateway}|${uid}`;
  if (live.current?.key !== key) {
    live.current = {
      key,
      pusher: createSurveyPusher({
        gateway,
        readRecord: () =>
          qc.getQueryData<OnboardingSurveyPreference | null>(surveyKey(uid)) ??
          null,
        writeRecord: async (record) => {
          qc.setQueryData(surveyKey(uid), record);
          await persistSurveyPreference(uid, record, liveSurveyStorePorts);
        },
        put: syncOnboardingToGateway,
        now: () => new Date().toISOString(),
      }),
    };
  }
  const { pusher } = live.current;

  // A record whose push never landed (offline, pod waking, signed out at the
  // time) catches up once per ACCOUNT, so the account store converges without
  // the user answering anything again. Keyed by uid, not a bare flag: a second
  // account signing in on this machine owes its own catch-up.
  const flushedUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const owed = owesGatewayCatchUp({
      survey,
      uid,
      flushedUid: flushedUid.current,
      // Whoever already owns this record's push — a save that claimed it before
      // writing it into the cache, which is the re-render that woke this.
      pendingFlush: pusher.claimed(),
    });
    if (!owed || !survey) return;
    // Latched only where the catch-up ITSELF performs the push: spending the
    // one-per-account allowance on a save's own flush would leave a genuinely
    // failed push with no retry for the rest of the session.
    flushedUid.current = uid;
    pusher.claim(survey);
    void pusher.flush(survey);
  }, [pusher, survey, uid]);

  return pusher;
}
