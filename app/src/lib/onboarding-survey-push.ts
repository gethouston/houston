import {
  markGatewaySynced,
  type OnboardingSurveyPreference,
} from "./onboarding-survey.ts";
import {
  type OnboardingSyncPatch,
  onboardingPatchFromSurvey,
} from "./onboarding-sync.ts";

export interface SurveyPushPorts {
  gateway: boolean;
  readRecord: () => OnboardingSurveyPreference | null;
  writeRecord: (record: OnboardingSurveyPreference) => Promise<void>;
  put: (patch: OnboardingSyncPatch) => Promise<boolean>;
  now: () => string;
}

export interface SurveyPusher {
  flush: (record: OnboardingSurveyPreference) => Promise<void>;
  claim: (record: OnboardingSurveyPreference) => void;
  claimed: () => string | null;
}

let chain: Promise<unknown> = Promise.resolve();

const ignore = (): void => {};

export function createSurveyPusher(ports: SurveyPushPorts): SurveyPusher {
  let claimed: string | null = null;
  let newest: string | null = null;

  const push = async (record: OnboardingSurveyPreference): Promise<void> => {
    try {
      if (newest !== record.updatedAt) return;
      const patch = onboardingPatchFromSurvey(record);
      if (!patch) return;
      if (!(await ports.put(patch))) return;
      const current = ports.readRecord();
      if (!current || current.updatedAt !== record.updatedAt) return;
      await ports.writeRecord(markGatewaySynced(current, ports.now()));
    } finally {
      if (claimed === record.updatedAt) claimed = null;
    }
  };

  return {
    claimed: () => claimed,
    claim: (record) => {
      if (ports.gateway) claimed = record.updatedAt;
    },
    flush: (record) => {
      if (!ports.gateway) return Promise.resolve();
      newest = record.updatedAt;
      const pushed = chain.then(() => push(record));
      chain = pushed.then(ignore, ignore);
      return pushed;
    },
  };
}
