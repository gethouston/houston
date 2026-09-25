import { useCallback, useEffect, useMemo, useState } from "react";
import { useIntegrationConnections } from "../../../hooks/queries/use-integrations";
import { useSettledConversations } from "../../../hooks/queries/use-settled-conversations";
import {
  type LessonSignals,
  lessonBeatSignal,
} from "../../../lib/academy/lesson-signals";
import type { LessonStepSpec } from "../../../lib/academy/lesson-spec";
import { subscribeHoustonEvents } from "../../../lib/events";
import { useUIStore } from "../../../stores/ui";
import { INTEGRATION_PROVIDER } from "../../integrations/model";

const NO_EVENTS: ReadonlySet<string> = new Set();

/**
 * The world as the ARMED beat sees it, read from queries and stores the app
 * maintains anyway — the lesson adds no fetches of its own (the cross-agent
 * conversation sweep is the same cache key the sidebar and the setup flow
 * mount, and the connections list is the one the Integrations screen reads,
 * refreshed by the real connect flow itself).
 *
 * Everything here is per-beat: the host events it has seen, the conversation
 * baseline it compares against and its companion's readiness are all dropped
 * and re-taken when the beat changes, so a lesson replayed in the same
 * session never inherits the previous run's world. The reading is handed to the pure
 * `lessonAdvance`; nothing in this file decides anything.
 */
export function useLessonSignals(step: LessonStepSpec | undefined): {
  signals: LessonSignals;
  /** The beat's companion is ready to see the taught action happen. */
  companionReady: () => void;
} {
  const viewMode = useUIStore((s) => s.viewMode);
  // Settledness (why the count is withheld until the sweep can be trusted)
  // lives with the shared hook.
  const { count: conversationCount } = useSettledConversations();

  const stepId = step?.id ?? null;
  const [armedStepId, setArmedStepId] = useState(stepId);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(NO_EVENTS);
  const [companionReady, setCompanionReady] = useState(false);

  // Arming a beat drops every reading. Adjusted during render (the documented
  // React way to reset state when an input changes) rather than in an effect,
  // so a beat can never run for one commit against the previous beat's world.
  if (armedStepId !== stepId) {
    setArmedStepId(stepId);
    setBaseline(null);
    setEvents(NO_EVENTS);
    setCompanionReady(false);
  }

  // The baseline is taken from the first settled sweep after arming.
  useEffect(() => {
    if (baseline !== null || conversationCount === null) return;
    setBaseline(conversationCount);
  }, [baseline, conversationCount]);

  const advanceOn = step === undefined ? null : lessonBeatSignal(step);

  // The connections list, only while a beat is waiting on a connection: every
  // other beat has no use for it, and a lesson adds no reads it does not need.
  const watchesConnections = advanceOn?.type === "integrationConnected";
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    watchesConnections,
  );
  const activeToolkits = useMemo(
    () =>
      watchesConnections && connections.data !== undefined
        ? new Set(
            connections.data
              .filter((c) => c.status === "active")
              .map((c) => c.toolkit),
          )
        : null,
    [watchesConnections, connections.data],
  );

  // The firehose, only while a beat is actually waiting on an event, and only
  // for the name it waits on: the set stays deduplicated so a chatty engine
  // cannot re-render the overlay per event.
  const watched = advanceOn?.type === "hostEvent" ? advanceOn.event : null;
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
  const signals = useMemo(
    () => ({
      viewMode,
      hostEventsSinceArmed: events,
      conversationCount,
      conversationBaseline: baseline,
      activeToolkits,
      companionReady,
    }),
    [
      viewMode,
      events,
      conversationCount,
      baseline,
      activeToolkits,
      companionReady,
    ],
  );
  const markCompanionReady = useCallback(() => setCompanionReady(true), []);
  return { signals, companionReady: markCompanionReady };
}
