import {
  ChannelAvatar,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "@houston-ai/chat";
import { CopyIcon, RefreshCwIcon, ThumbsDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { messageProps, messageTokens } from "./chat-message-parts";
import {
  AGENT_SHORT_TURN,
  AGENT_TURN,
  PEER_TURN,
  USER_TURN,
} from "./sample-chat";

/**
 * A message is `w-full` and lays itself out against the column it sits in, so
 * every row gets the same fixed measure — otherwise a right-aligned bubble
 * would align to whatever the row happened to be wide.
 */
function Thread({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-md flex-col gap-4">{children}</div>;
}

function ChatMessageSpecimen() {
  return (
    <SpecimenPage
      title="Message"
      intro="One turn in the conversation: the bubble a person speaks in, and the plain prose the agent answers with."
    >
      <SpecimenSection
        title="Variants"
        note="`from` and `peer` together decide the bubble. The agent answers as prose on the canvas, never in a bubble, so its lists and code keep the full column."
      >
        <SpecimenRow label="from='user'">
          <Thread>
            <Message from="user">
              <MessageContent>{USER_TURN}</MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="from='assistant'">
          <Thread>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{AGENT_TURN}</MessageResponse>
              </MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="from='user' peer">
          <Thread>
            <Message from="user" peer>
              <MessageContent>{PEER_TURN}</MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="from='assistant' peer">
          <Thread>
            <Message from="assistant" peer>
              <MessageContent>
                <MessageResponse>{AGENT_SHORT_TURN}</MessageResponse>
              </MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A turn that arrived through a channel carries that channel's badge; a turn the user can act on carries a toolbar. Both are visible at rest — nothing here is gated behind hover."
      >
        <SpecimenRow label="avatar (Telegram)">
          <Thread>
            <Message from="user" avatar={<ChannelAvatar source="telegram" />}>
              <MessageContent>{USER_TURN}</MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="avatar (Slack, peer)">
          <Thread>
            <Message from="user" peer avatar={<ChannelAvatar source="slack" />}>
              <MessageContent>{PEER_TURN}</MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="MessageToolbar">
          <Thread>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{AGENT_SHORT_TURN}</MessageResponse>
              </MessageContent>
              <MessageToolbar>
                <MessageActions>
                  <MessageAction tooltip="Copy reply">
                    <CopyIcon className="size-4" />
                  </MessageAction>
                  <MessageAction tooltip="Ask again">
                    <RefreshCwIcon className="size-4" />
                  </MessageAction>
                  <MessageAction tooltip="Not what I wanted">
                    <ThumbsDownIcon className="size-4" />
                  </MessageAction>
                </MessageActions>
              </MessageToolbar>
            </Message>
          </Thread>
        </SpecimenRow>
        <SpecimenRow label="markdown link, no onOpenLink">
          <Thread>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>
                  {"The invoice is at https://dashboard.stripe.com/invoices."}
                </MessageResponse>
              </MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One type scale. Width is what changes: a person's bubble caps at 70% of the column, a bubbled agent turn at 85% (its prose needs the line), and assistant prose takes the column."
      >
        <SpecimenRow label="70% / 85% / full">
          <Thread>
            <Message from="user">
              <MessageContent>{"Thanks."}</MessageContent>
            </Message>
            <Message from="assistant" peer>
              <MessageContent>
                <MessageResponse>{AGENT_SHORT_TURN}</MessageResponse>
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{AGENT_TURN}</MessageResponse>
              </MessageContent>
            </Message>
          </Thread>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={messageProps} />
      <SpecimenTokens classes={messageTokens} />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = [
  "Message",
  "MessageContent",
  "MessageResponse",
  "MessageActions",
  "MessageAction",
  "MessageToolbar",
  "ChannelAvatar",
];

export const specimen: Specimen = {
  id: "chat-message",
  title: "Message",
  group: "Chat",
  render: () => <ChatMessageSpecimen />,
};
