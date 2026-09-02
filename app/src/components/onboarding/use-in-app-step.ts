import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../hooks/use-session";
import type { InAppStep } from "./in-app-onboarding-flow";
import { inAppResumeKey, resumeStepFor } from "./in-app-resume";

/**
 * The in-app setup's current step, mirrored on the device for a FIRST-RUN
 * run so a reload re-enters the flow where it was ({@link resumeStepFor})
 * rather than at welcome. A replay from the help menu always starts fresh
 * and mirrors nothing. The mirror is per signed-in user, like the survey's
 * device copies, and `clear` is every finish's job.
 *
 * localStorage is best-effort: disabled or full storage only costs the
 * resume (the run itself never depends on it), so those paths stay quiet.
 */
export function useInAppStep(
  firstRun: boolean,
): [InAppStep, (step: InAppStep) => void, () => void] {
  const { data: session } = useSession();
  const uid = session?.uid ?? null;
  const [step, setStep] = useState<InAppStep>(() =>
    firstRun ? resumeStepFor(readLocal(inAppResumeKey(uid))) : "welcome",
  );

  useEffect(() => {
    if (firstRun) writeLocal(inAppResumeKey(uid), step);
  }, [firstRun, uid, step]);

  const clear = useCallback(() => {
    writeLocal(inAppResumeKey(uid), null);
  }, [uid]);

  return [step, setStep, clear];
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; /* disabled storage — the run starts at welcome */
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* quota / disabled storage — only the resume is lost */
  }
}
