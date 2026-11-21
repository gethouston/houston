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

export function useLessonSignals(step: LessonStepSpec | undefined): {
  signals: LessonSignals;
  companionReady: () => void;
} {
  const viewMode = useUIStore((s) => s.viewMode);
  const { count: conversationCount } = useSettledConversations();

  const stepId = step?.id ?? null;
  const [armedStepId, setArmedStepId] = useState(stepId);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(NO_EVENTS);
  const [companionReady, setCompanionReady] = useState(false);

  if (armedStepId !== stepId) {
    setArmedStepId(stepId);
    setBaseline(null);
    setEvents(NO_EVENTS);
    setCompanionReady(false);
  }

  useEffect(() => {
    if (baseline !== null || conversationCount === null) return;
    setBaseline(conversationCount);
  }, [baseline, conversationCount]);

  const advanceOn = step === undefined ? null : lessonBeatSignal(step);

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
