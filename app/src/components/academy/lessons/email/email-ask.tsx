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
  const senderRead = useSyncExternalStore(
    sliceCoverage.subscribe,
    () => sender !== null && sliceCoverage.wasRead(sender.folderPath),
  );

  useEffect(() => {
    useEmailLessonStore.getState().setAsk(null);
    return () => {
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

  useEffect(() => {
    if (note.current !== null || !settled || sender === null) return;
    const taken = senderRead
      ? emailAsk(rows, sender.folderPath, sliceCoverage)
      : null;
    if (taken === null) {
      if (reread.current) return;
      reread.current = true;
      patchAgentSlice(queryClient, sender.folderPath).catch((e) => {
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
