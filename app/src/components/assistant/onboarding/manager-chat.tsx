import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { type ReactNode, useEffect, useRef } from "react";
import { useVisualViewportInset } from "../../../hooks/use-visual-viewport-inset";
import {
  onboardingCard,
  teamCardItem,
} from "../../../lib/manager-onboarding/onboarding-feed";
import type { ScriptLine } from "../../../lib/manager-onboarding/script";
import { useBoardLabels } from "../../board/use-board-labels";
import { AssistantPhoneHeader } from "../assistant-phone-header";
import { ManagerReceipt } from "./manager-receipt";
import { OnboardingTeamCard } from "./onboarding-team-card";
import type { ScriptCopy } from "./use-script-copy";
import { useScriptedReveal } from "./use-scripted-reveal";

const SESSION_KEY = "manager-onboarding";
const noSend = async () => {};

type ManagerLine = Extract<ScriptLine, { kind: "manager" }>;

function isCard(line: ManagerLine): boolean {
  return line.id === "closingTeam";
}

export function ManagerChat({
  lines,
  copy,
  prompt,
  locked = false,
  onChange,
  onSaid,
}: {
  lines: ScriptLine[];
  copy: ScriptCopy;
  prompt: ReactNode;
  locked?: boolean;
  onChange: (line: Extract<ScriptLine, { kind: "receipt" }>) => void;
  onSaid?: () => void;
}) {
  const reveal = useScriptedReveal(lines, (line) =>
    isCard(line) ? "" : copy.manager(line),
  );
  const saidRef = useRef(onSaid);
  saidRef.current = onSaid;
  const awaitingSaid = onSaid !== undefined;
  useEffect(() => {
    if (reveal.settled && awaitingSaid) saidRef.current?.();
  }, [reveal.settled, awaitingSaid]);
  const rootRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportInset(rootRef);
  const { composerLabels } = useBoardLabels("assistant");
  const byKey = new Map(lines.map((line) => [`user-${line.key}`, line]));
  const answers = lines.filter((line) => line.kind === "receipt").length;
  const said = (line: ManagerLine): FeedItem =>
    isCard(line)
      ? teamCardItem(line.key, { reach: line.reach ?? null })
      : { feed_type: "assistant_text", id: line.key, data: copy.manager(line) };

  const feed: FeedItem[] = reveal.shown.map((line) =>
    line.kind === "manager"
      ? said(line)
      : {
          feed_type: "user_message",
          id: line.key,
          data: copy.receipt(line).answer,
        },
  );
  const typing = reveal.typing;
  const typed = typing
    ? lines.find((line) => line.key === typing.key)
    : undefined;
  if (typing && typed?.kind === "manager")
    feed.push(
      isCard(typed)
        ? said(typed)
        : {
            feed_type: "assistant_text_streaming",
            id: typing.key,
            data: typing.text,
          },
    );

  return (
    <div
      ref={rootRef}
      data-testid="manager-onboarding"
      className="flex h-full min-h-0 flex-col pb-safe"
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      <AssistantPhoneHeader />
      <div className="@container-size flex min-h-0 flex-1 flex-col">
        <ChatPanel
          sessionKey={SESSION_KEY}
          feedItems={feed}
          isLoading={false}
          status={reveal.typing ? "streaming" : "ready"}
          onSend={noSend}
          composerLabels={composerLabels}
          scrollToLatestToken={answers}
          renderUserMessage={(message) => {
            const line = byKey.get(message.key);
            if (line?.kind !== "receipt") return undefined;
            return (
              <ManagerReceipt
                copy={copy.receipt(line)}
                onChange={
                  line.editable && reveal.settled && !locked
                    ? () => onChange(line)
                    : undefined
                }
              />
            );
          }}
          renderSystemMessage={(message) => {
            const card = message.hostCard
              ? onboardingCard(message.hostCard)
              : null;
            return card?.kind === "team" ? (
              <OnboardingTeamCard reach={card.team.reach} />
            ) : undefined;
          }}
          composerOverrideMode="replace"
          composerOverride={
            <div
              data-testid="manager-onboarding-prompt"
              hidden={!reveal.settled}
            >
              {prompt}
            </div>
          }
        />
      </div>
    </div>
  );
}
