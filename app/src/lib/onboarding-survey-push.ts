// The GATEWAY half of the onboarding survey: who owns a given record's push,
// the ORDER those pushes land in, and which one earns the "synced" stamp.
// Split from `hooks/onboarding-survey-flush` — which is only the live wiring
// (query cache, device store, network) plus the catch-up effect — so these
// convergence rules are driven directly by `app/tests`, with no React, no
// engine and no network.

import {
  markGatewaySynced,
  type OnboardingSurveyPreference,
} from "./onboarding-survey.ts";
import {
  type OnboardingSyncPatch,
  onboardingPatchFromSurvey,
} from "./onboarding-sync.ts";

/** Everything the push touches outside itself, injected by its caller. */
export interface SurveyPushPorts {
  /** Whether this deployment has an account store to push to at all. */
  gateway: boolean;
  /** The record this device holds RIGHT NOW (the query cache). */
  readRecord: () => OnboardingSurveyPreference | null;
  /** Store a record everywhere this device keeps it (cache, engine, mirror). */
  writeRecord: (record: OnboardingSurveyPreference) => Promise<void>;
  /** Push answers to the account store. `false` = not stored, retried later. */
  put: (patch: OnboardingSyncPatch) => Promise<boolean>;
  /** Clock for the sync stamp. */
  now: () => string;
}

export interface SurveyPusher {
  /**
   * Push everything `record` holds and, if it lands, stamp the cached record as
   * synced. Never throws: an unsynced record is retried, not surfaced.
   */
  flush: (record: OnboardingSurveyPreference) => Promise<void>;
  /**
   * Claim `record`'s push for the caller — call it BEFORE writing the record
   * anywhere the catch-up can observe it.
   */
  claim: (record: OnboardingSurveyPreference) => void;
  /** `updatedAt` of the record whose push is already owned, else null. */
  claimed: () => string | null;
}

/**
 * ONE chain of pushes for the whole app, module level on purpose.
 *
 * Two pushes that overlap can LAND in the opposite order to the one the user
 * answered in — a waking pod holds the first request open while the second
 * flies through — and that divergence is permanent: the gateway keeps the
 * answer the user replaced, while this device stamps the newer one as synced,
 * and nothing repairs it (the catch-up skips a stamped record and the gateway
 * merge only ever fills local gaps). Waiting for the push in flight to settle
 * makes the user's last answer the gateway's last write, always.
 *
 * Module level rather than per pusher because a pusher is rebuilt whenever its
 * ports change identity (a uid switch, a deployment that gains a gateway):
 * ordering has to outlive the instance that started it.
 */
let chain: Promise<unknown> = Promise.resolve();

const ignore = (): void => {};

/** The push rules, over one set of ports. */
export function createSurveyPusher(ports: SurveyPushPorts): SurveyPusher {
  // `updatedAt` of the record whose push is already owned — by a save that
  // claimed it, or by the catch-up. Lets the catch-up tell "nobody is pushing
  // this" from "the save that just wrote it is".
  let claimed: string | null = null;
  // `updatedAt` of the newest record handed to `flush`, so one that was
  // superseded while it waited its turn can be dropped.
  let newest: string | null = null;

  const push = async (record: OnboardingSurveyPreference): Promise<void> => {
    try {
      // Superseded while it queued. Every push sends the WHOLE record, so the
      // newer one carries this one's answers too, and the device no longer
      // holds this record for a landing to stamp — sending it is pure noise,
      // and skipping it keeps a burst of answers behind a waking pod down to
      // two round trips instead of one per question.
      if (newest !== record.updatedAt) return;
      // The WHOLE record, never just the answer this save added: success stamps
      // the whole record as synced, so a delta payload would make that stamp a
      // lie the moment an earlier push had failed — the dropped answer would
      // never be sent again (the catch-up skips a stamped record, and the
      // gateway merge only fills local gaps). The server upsert is idempotent
      // and moves no `*_answered_at` for a value it already holds, so
      // re-sending the rest costs nothing.
      const patch = onboardingPatchFromSurvey(record);
      if (!patch) return;
      if (!(await ports.put(patch))) return;
      const current = ports.readRecord();
      // A newer answer landed while the request was in flight; its own push
      // owns the stamp, and stamping this stale copy would lose that answer.
      if (!current || current.updatedAt !== record.updatedAt) return;
      await ports.writeRecord(markGatewaySynced(current, ports.now()));
    } finally {
      // Released on FAILURE too: a push that never landed is precisely what the
      // catch-up is for, and it is still owed a retry this session.
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
      // The chain itself must never carry a rejection forward, or one thrown
      // push would strand every later answer. The caller still gets `pushed`.
      chain = pushed.then(ignore, ignore);
      return pushed;
    },
  };
}
