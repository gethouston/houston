import { useEffect, useMemo, useState } from "react";
import { useSettledConversations } from "../../../hooks/queries/use-settled-conversations";
import type { LessonSignals } from "../../../lib/academy/lesson-signals";
import type { LessonStepSpec } from "../../../lib/academy/lesson-spec";
import { subscribeHoustonEvents } from "../../../lib/events";
import { useUIStore } from "../../../stores/ui";

const NO_EVENTS: ReadonlySet<string> = new Set();

/**
 * The world as the ARMED beat sees it, read from queries and stores the app
 * maintains anyway — the lesson adds no fetches of its own (the cross-agent
 * conversation sweep is the same cache key the sidebar and the setup flow
 * mount).
 *
 * Everything here is per-beat: the host events it has seen and the
 * conversation baseline it compares against are both dropped and re-taken when
 * the beat changes, so a lesson replayed in the same session never inherits
 * the previous run's world. The reading is handed to the pure
 * `lessonAdvance`; nothing in this file decides anything.
 */
export function useLessonSignals(
  step: LessonStepSpec | undefined,
): LessonSignals {
  const viewMode = useUIStore((s) => s.viewMode);
  // Settledness (why the count is withheld until the sweep can be trusted)
  // lives with the shared hook; the guided setup reads the same one.
  const { count: conversationCount } = useSettledConversations();

  const stepId = step?.id ?? null;
  const [armedStepId, setArmedStepId] = useState(stepId);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(NO_EVENTS);

  // Arming a beat drops both readings. Adjusted during render (the documented
  // React way to reset state when an input changes) rather than in an effect,
  // so a beat can never run for one commit against the previous beat's world.
  if (armedStepId !== stepId) {
    setArmedStepId(stepId);
    setBaseline(null);
    setEvents(NO_EVENTS);
  }

  // The baseline is taken from the first settled sweep after arming.
  useEffect(() => {
    if (baseline !== null || conversationCount === null) return;
    setBaseline(conversationCount);
  }, [baseline, conversationCount]);

  // The firehose, only while a beat is actually waiting on an event, and only
  // for the name it waits on: the set stays deduplicated so a chatty engine
  // cannot re-render the overlay per event.
  const watched =
    step?.kind === "spotlight" && step.advanceOn.type === "hostEvent"
      ? step.advanceOn.event
      : null;
  useEffect(() => {
    if (watched === null) return;
    return subscribeHoustonEvents((ev) => {
      if (ev.type !== watched) return;
      setEvents((prev) =>
        prev.has(watched) ? prev : new Set(prev).add(watched),
      );
    });
  }, [watched]);

  // Memoized: the runner's advance effect depends on this object, and a fresh
  // one every render would re-run it on every unrelated re-render of the shell.
  return useMemo(
    () => ({
      viewMode,
      hostEventsSinceArmed: events,
      conversationCount,
      conversationBaseline: baseline,
    }),
    [viewMode, events, conversationCount, baseline],
  );
}
