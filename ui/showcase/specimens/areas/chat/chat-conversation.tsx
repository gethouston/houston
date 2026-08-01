import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
} from "@houston-ai/chat";
import { MessageSquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { AGENT_TURN, PEER_TURN, USER_TURN } from "./sample-chat";

/**
 * The log is `flex-1` and sticks to the bottom of whatever it is given, so
 * every row hands it a fixed frame — the panel it lives in, at review size.
 */
function Pane({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-72 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-card">
      {children}
    </div>
  );
}

/** The mission, long enough that the pane actually has somewhere to scroll. */
function SampleTurns() {
  return (
    <>
      <Message from="user">
        <MessageContent>{USER_TURN}</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{AGENT_TURN}</MessageResponse>
        </MessageContent>
      </Message>
      <Message from="user" peer>
        <MessageContent>{PEER_TURN}</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>
            {"Left it alone. I will check back on Monday."}
          </MessageResponse>
        </MessageContent>
      </Message>
    </>
  );
}

function ChatConversationSpecimen() {
  return (
    <SpecimenPage
      title="Conversation"
      intro="The scrolling mission log: it pins itself to the newest turn, and offers a way back down the moment you scroll away."
    >
      <SpecimenSection
        title="Variants"
        note="Two states of one surface. A mission with turns sticks to the bottom; a mission with none shows `ConversationEmptyState` in place of the log."
      >
        <SpecimenRow label="With turns">
          <Pane>
            <Conversation>
              <ConversationContent>
                <SampleTurns />
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="ConversationEmptyState">
          <Pane>
            <Conversation>
              <ConversationContent>
                <ConversationEmptyState
                  icon={<MessageSquareIcon className="size-6" />}
                  title="Nothing here yet"
                  description="Ask Inbox Zero for something and the mission starts."
                />
              </ConversationContent>
            </Conversation>
          </Pane>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`ConversationScrollButton` is the only moving part: it mounts inside the log, reads the stick-to-bottom context, and renders nothing at all while you are already at the newest turn. Scroll the pane above up to bring it in."
      >
        <SpecimenRow label="Empty state defaults">
          <Pane>
            <Conversation>
              <ConversationContent>
                <ConversationEmptyState />
              </ConversationContent>
            </Conversation>
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="Empty state, custom body">
          <Pane>
            <Conversation>
              <ConversationContent>
                <ConversationEmptyState>
                  <p className="text-ink text-sm">
                    Meeting Notes has nothing to show until it joins a call.
                  </p>
                </ConversationEmptyState>
              </ConversationContent>
            </Conversation>
          </Pane>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "className",
            type: "string",
            note: "Conversation. Merged onto the wrapper. The element it renders is not the scroll pane; the library builds that inside the content.",
          },
          {
            name: "children",
            type: "React.ReactNode",
            note: "ConversationContent. The turns. It sets the 32px column gap and the top clearance the scroll fade needs.",
          },
          {
            name: "title",
            type: "string",
            note: 'ConversationEmptyState. Defaults to "No messages yet".',
          },
          {
            name: "description",
            type: "string",
            note: 'ConversationEmptyState. Defaults to "Start a conversation to see messages here".',
          },
          {
            name: "icon",
            type: "React.ReactNode",
            note: "ConversationEmptyState. Optional glyph above the title, rendered in the muted role.",
          },
          {
            name: "children",
            type: "React.ReactNode",
            note: "ConversationEmptyState. Replaces the whole icon/title/description body when given.",
          },
        ]}
      />

      <SpecimenTokens
        classes={["text-ink", "text-ink-muted", "dark:bg-input"]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = [
  "Conversation",
  "ConversationContent",
  "ConversationEmptyState",
  "ConversationScrollButton",
];

export const specimen: Specimen = {
  id: "chat-conversation",
  title: "Conversation",
  group: "Chat",
  render: () => <ChatConversationSpecimen />,
};
