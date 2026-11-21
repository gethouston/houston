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
import { surveyKey } from "./survey-query";

export function useSurveyGatewaySync(input: {
  uid: string | null;
  gateway: boolean;
  survey: OnboardingSurveyPreference | null;
}): SurveyPusher {
  const { uid, gateway, survey } = input;
  const qc = useQueryClient();

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

  const flushedUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const owed = owesGatewayCatchUp({
      survey,
      uid,
      flushedUid: flushedUid.current,
      pendingFlush: pusher.claimed(),
    });
    if (!owed || !survey) return;
    flushedUid.current = uid;
    pusher.claim(survey);
    void pusher.flush(survey);
  }, [pusher, survey, uid]);

  return pusher;
}
