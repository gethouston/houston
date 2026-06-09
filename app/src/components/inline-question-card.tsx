import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  QuestionCard,
  type QuestionAnswerSet,
  type QuestionCardLabels,
  type QuestionSpec,
} from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { tauriChat } from "../lib/tauri";
import {
  encodeQuestionAnswerMessage,
  findQuestionAnswerInFeed,
} from "../lib/question-message";

export interface InlineQuestionCardProps {
  agentPath: string;
  sessionKey: string;
  spec: QuestionSpec;
  providerOverride: string;
  modelOverride: string;
  effortOverride: string;
  labels?: QuestionCardLabels;
}

export function InlineQuestionCard({
  agentPath,
  sessionKey,
  spec,
  providerOverride,
  modelOverride,
  effortOverride,
  labels,
}: InlineQuestionCardProps) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const feedItems = useFeedStore(
    (s) => s.items[agentPath]?.[sessionKey] ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  const initialAnswers = useMemo(
    () => findQuestionAnswerInFeed(feedItems, spec.id),
    [feedItems, spec.id],
  );
  const answered = initialAnswers !== null;

  const handleSubmit = useCallback(
    async (answerSet: QuestionAnswerSet) => {
      if (answered || submitting) return;
      const encoded = encodeQuestionAnswerMessage(spec, answerSet);
      setSubmitting(true);
      try {
        await tauriChat.send(agentPath, encoded, sessionKey, {
          providerOverride,
          modelOverride,
          effortOverride,
        });
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "user_message",
          data: encoded,
        });
      } catch (err) {
        addToast({
          title: t("question.submitFailed"),
          description: String(err),
          variant: "error",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      agentPath,
      answered,
      effortOverride,
      modelOverride,
      providerOverride,
      pushFeedItem,
      sessionKey,
      spec,
      submitting,
      addToast,
      t,
    ],
  );

  return (
    <InlineQuestionCardShell>
      <QuestionCard
        spec={spec}
        onSubmit={handleSubmit}
        answered={answered}
        initialAnswers={initialAnswers ?? undefined}
        submitting={submitting}
        labels={labels}
      />
    </InlineQuestionCardShell>
  );
}

function InlineQuestionCardShell({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl mx-auto w-full">{children}</div>;
}
