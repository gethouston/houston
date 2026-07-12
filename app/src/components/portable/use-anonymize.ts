/**
 * The anonymize pass for the share wizard, item by item so it's resumable:
 * each finished piece lands in the review list right away, and "use what's
 * ready" flips the remaining items to the instant non-AI scrub (whatever the
 * AI already did is kept). Owns the pass's state and its failure toast.
 */

import type {
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableInventoryPreview,
} from "@houston-ai/engine-client";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-toast";
import type { WizardSelection } from "../../lib/portable-share";
import { type AnonymizeAccept, acceptFor } from "../../lib/portable-share";
import { useUIStore } from "../../stores/ui";

/** Show the "use what's ready" escape hatch once the AI pass runs this long. */
const SLOW_AFTER_MS = 15_000;

export interface UseAnonymize {
  wantAnonymize: boolean | null;
  setWantAnonymize: (v: boolean) => void;
  useAi: boolean;
  setUseAi: (v: boolean) => void;
  anonymizing: boolean;
  progress: { done: number; total: number } | null;
  slow: boolean;
  stopped: boolean;
  anonymized: PortableAnonymizeResponse | null;
  accept: AnonymizeAccept;
  setAccept: (a: AnonymizeAccept) => void;
  run: (withAi?: boolean) => Promise<void>;
  stopWaiting: () => void;
  reset: () => void;
}

export function useAnonymize(args: {
  agentPath: string | null;
  preview: PortableInventoryPreview | null;
  selection: WizardSelection;
}): UseAnonymize {
  const { agentPath, preview, selection } = args;
  const { t } = useTranslation("portable");
  const addToast = useUIStore((s) => s.addToast);

  const [wantAnonymize, setWantAnonymize] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [anonymizing, setAnonymizing] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [slow, setSlow] = useState(false);
  const [stopped, setStopped] = useState(false);
  // The loop reads this between items; state alone would be a stale closure.
  const stopRef = useRef(false);
  const [anonymized, setAnonymized] =
    useState<PortableAnonymizeResponse | null>(null);
  const [accept, setAccept] = useState<AnonymizeAccept>({
    claudeMd: true,
    skills: {},
    routines: {},
    learnings: {},
  });

  const reset = useCallback(() => {
    setWantAnonymize(null);
    setAnonymized(null);
  }, []);

  const stopWaiting = () => {
    stopRef.current = true;
    setStopped(true);
  };

  const run = async (withAi: boolean = useAi) => {
    if (!agentPath || !preview) return;
    setAnonymizing(true);
    setAnonymized(null);
    setStopped(false);
    stopRef.current = false;
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    const none = {
      claudeMd: false,
      skillSlugs: [],
      routineIds: [],
      learningIds: [],
    };
    const units: PortableAnonymizeRequest[] = [
      ...(selection.claudeMd ? [{ ...none, claudeMd: true }] : []),
      ...Array.from(selection.skillSlugs, (s) => ({
        ...none,
        skillSlugs: [s],
      })),
      ...Array.from(selection.routineIds, (r) => ({
        ...none,
        routineIds: [r],
      })),
      ...Array.from(selection.learningIds, (l) => ({
        ...none,
        learningIds: [l],
      })),
    ];
    const acc: PortableAnonymizeResponse = {
      claudeMd: null,
      skills: [],
      routines: [],
      learnings: [],
      mode: withAi ? "ai" : "patterns",
    };

    try {
      setProgress({ done: 0, total: units.length });
      let aiFailed = false;
      for (const [i, unit] of units.entries()) {
        const part = await getEngine().portableAnonymize(agentPath, {
          ...unit,
          useAi: withAi && !aiFailed && !stopRef.current,
        });
        acc.claudeMd = part.claudeMd ?? acc.claudeMd;
        acc.skills.push(...part.skills);
        acc.routines.push(...part.routines);
        acc.learnings.push(...part.learnings);
        if (part.aiError && !acc.aiError) {
          // Once the AI pass fails (no provider, bad reply) the rest of the run
          // stays on the instant scrub — one visible reason, not N slow repeats.
          acc.aiError = part.aiError;
          aiFailed = true;
        }
        setProgress({ done: i + 1, total: units.length });
        setAnonymized({
          ...acc,
          skills: [...acc.skills],
          routines: [...acc.routines],
          learnings: [...acc.learnings],
        });
        setAccept(acceptFor(acc));
      }
    } catch (err) {
      addToast({
        variant: "error",
        title: t("export.errors.anonymizeFailed"),
        description: genericErrorDescription("export_anonymize", err),
      });
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setProgress(null);
      setAnonymizing(false);
    }
  };

  return {
    wantAnonymize,
    setWantAnonymize,
    useAi,
    setUseAi,
    anonymizing,
    progress,
    slow,
    stopped,
    anonymized,
    accept,
    setAccept,
    run,
    stopWaiting,
    reset,
  };
}
