import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationConnections } from "../../../../hooks/queries/use-integrations";
import { useSettledConversations } from "../../../../hooks/queries/use-settled-conversations";
import { connectedEmailToolkit } from "../../../../lib/academy/email-lesson/email-sender";
import {
  type EmailAsk,
  emailAsk,
  emailTask,
} from "../../../../lib/academy/email-lesson/email-task";
import { sliceCoverage } from "../../../../lib/all-conversations-coverage";
import { patchAgentSlice } from "../../../../lib/all-conversations-patch";
import { logger } from "../../../../lib/logger";
import { composeTaskFor } from "../../../../lib/new-mission";
import { useUIStore } from "../../../../stores/ui";
import { INTEGRATION_PROVIDER } from "../../../integrations/model";
import type { LessonCompanionProps } from "../lesson-companion";
import { useEmailLessonStore } from "./email-lesson-store";
import { useEmailSender } from "./use-email-sender";

/**
 * The ask beat's companion: it opens the picked AI Employee's New task
 * composer with the request already typed in, naming the connected email app
 * so the AI Employee sends through it. The beat's spotlight lights the Send
 * button, and the press is the user's own.
 *
 * It notes the tasks the sender already has before the beat arms, so the
 * click it teaches cannot land before the note, and ends the beat when the
 * sender has a task the note does not hold: that AI Employee's, never any
 * conversation appearing elsewhere.
 *
 * The request is a seed (`composeTaskFor`): the composer shows it in a slot
 * of its own, so whatever draft the user had parked there is never touched,
 * and the seed ends with the beat, sent or not.
 */
export function EmailAskCompanion({ onNext, onReady }: LessonCompanionProps) {
  const { t } = useTranslation("academy");
  const { sender } = useEmailSender();
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const { rows, settled } = useSettledConversations();
  const opened = useRef(false);
  const note = useRef<EmailAsk | null>(null);
  const reread = useRef(false);
  const queryClient = useQueryClient();
  const sent = useRef(false);
  const endSeed = useRef<(() => void) | null>(null);
  // A reread that finds the rows the board already held leaves them as they
  // were; the read itself is what makes the note possible, so it is watched.
  const senderRead = useSyncExternalStore(
    sliceCoverage.subscribe,
    () => sender !== null && sliceCoverage.wasRead(sender.folderPath),
  );

  // A note left by an earlier run must never name this run's task.
  useEffect(() => {
    useEmailLessonStore.getState().setAsk(null);
    return () => {
      // Leaving before a board took the request must not leave it for one later.
      useUIStore.getState().requestNewTask(null);
      endSeed.current?.();
    };
  }, []);

  const connectionsRead = connections.data !== undefined || connections.isError;
  useEffect(() => {
    if (opened.current || sender === null || !connectionsRead) return;
    opened.current = true;
    const toolkit = connectedEmailToolkit(connections.data ?? []);
    endSeed.current = composeTaskFor(
      sender,
      toolkit === null
        ? t("lessons.employee-email.steps.ask.requestAnyApp")
        : t("lessons.employee-email.steps.ask.request", { app: toolkit.label }),
    );
  }, [sender, connectionsRead, connections.data, t]);

  // The note comes only from a slice of the sender's read this session. A
  // board restored from disk, or one whose last sweep missed the sender, is
  // read again for the sender alone, and that read retakes the note.
  useEffect(() => {
    if (note.current !== null || !settled || sender === null) return;
    const taken = senderRead
      ? emailAsk(rows, sender.folderPath, sliceCoverage)
      : null;
    if (taken === null) {
      if (reread.current) return;
      reread.current = true;
      patchAgentSlice(queryClient, sender.folderPath).catch((e) => {
        // The read surfaced its own failure; the beat stays shut until a
        // later read of the sender lands, and the lesson can be left.
        logger.warn(`[academy] email sender read failed: ${e}`);
      });
      return;
    }
    note.current = taken;
    useEmailLessonStore.getState().setAsk(taken);
    onReady();
  }, [settled, rows, senderRead, sender, onReady, queryClient]);

  useEffect(() => {
    if (note.current === null || sent.current) return;
    if (emailTask(rows, note.current) === null) return;
    sent.current = true;
    onNext();
  }, [rows, onNext]);

  return null;
}
