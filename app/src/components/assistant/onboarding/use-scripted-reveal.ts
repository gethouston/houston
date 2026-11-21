import { durationMs } from "@houston/design-tokens";
import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  nextUnrevealed,
  openingRevealed,
  revealFrames,
} from "../../../lib/manager-onboarding/reveal";
import type { ScriptLine } from "../../../lib/manager-onboarding/script";

const WORD_MS = 40;

export interface ScriptedReveal {
  shown: ScriptLine[];
  typing: { key: string; text: string } | null;
  settled: boolean;
}

export function useScriptedReveal(
  lines: ScriptLine[],
  textOf: (line: Extract<ScriptLine, { kind: "manager" }>) => string,
): ScriptedReveal {
  const reduce = useReducedMotion() ?? false;
  const [revealed, setRevealed] = useState(() => openingRevealed(lines));
  const next = nextUnrevealed(lines, revealed);
  const target = next >= 0 ? lines[next] : null;
  const key = target?.key ?? null;
  const text = target?.kind === "manager" ? textOf(target) : "";
  const frames = useMemo(() => revealFrames(text), [text]);
  const [progress, setProgress] = useState<{ key: string; frame: number }>({
    key: "",
    frame: -1,
  });

  useEffect(() => {
    if (key === null) return;
    const done = () => setRevealed((current) => new Set(current).add(key));
    if (reduce) {
      done();
      return;
    }
    let frame = -1;
    let ticker: ReturnType<typeof setInterval> | undefined;
    const pause = setTimeout(() => {
      ticker = setInterval(() => {
        frame += 1;
        if (frame >= frames.length) {
          clearInterval(ticker);
          done();
          return;
        }
        setProgress({ key, frame });
      }, WORD_MS);
    }, durationMs.fast);
    return () => {
      clearTimeout(pause);
      clearInterval(ticker);
    };
  }, [key, frames, reduce]);

  const typing =
    key !== null && progress.key === key && progress.frame >= 0
      ? { key, text: frames[Math.min(progress.frame, frames.length - 1)] }
      : null;
  return {
    shown: next >= 0 ? lines.slice(0, next) : lines,
    typing,
    settled: next < 0,
  };
}
