import { Badge } from "@houston-ai/core";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  chatInputProps,
  LiveComposer,
  MENTION_PEOPLE,
  StaticComposer,
} from "./chat-input-parts";

/** The messages waiting behind a running turn. */
const QUEUED = [
  { id: "q-1", text: "Also archive anything older than a year." },
  {
    id: "q-2",
    text: "And add the December invoice to the folder.",
    attachmentNames: ["december-invoice.pdf"],
  },
];

function ChatInputSpecimen() {
  return (
    <SpecimenPage
      title="ChatInput"
      intro="The composer: the one place a person talks to an agent, with everything it can carry hanging off it."
    >
      <SpecimenSection
        title="Variants"
        note="Every composer below is live. Type into one and press Enter: the send resolves and the line underneath echoes what `onSend` received."
      >
        <SpecimenRow label="Default">
          <LiveComposer placeholder="Ask Inbox Zero for something" />
        </SpecimenRow>
        <SpecimenRow label="footer">
          <LiveComposer
            placeholder="Ask Inbox Zero for something"
            footer={<Badge variant="outline">Claude Opus 4.5</Badge>}
          />
        </SpecimenRow>
        <SpecimenRow label="header">
          <LiveComposer
            placeholder="Ask Meeting Notes for something"
            header={
              <div className="px-1 pb-1 text-ink-muted text-xs">
                Replying to the 9:00 standup
              </div>
            }
          />
        </SpecimenRow>
        <SpecimenRow label="mentionPeople">
          <LiveComposer
            placeholder="Type @ to bring in a teammate"
            mentionPeople={MENTION_PEOPLE}
            draftKey="showcase-mission"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`status` says what the turn is doing, `disabled` says the composer is not the user's to touch, and `queuedMessages` says what is already waiting behind the running turn."
      >
        <SpecimenRow label='status="ready"'>
          <StaticComposer
            status="ready"
            placeholder="Ask Inbox Zero for something"
            onSend={() => undefined}
          />
        </SpecimenRow>
        <SpecimenRow label='status="submitted"'>
          <StaticComposer
            status="submitted"
            placeholder="Ask Inbox Zero for something"
            onSend={() => undefined}
            onStop={() => undefined}
          />
        </SpecimenRow>
        <SpecimenRow label='status="streaming"'>
          <StaticComposer
            status="streaming"
            placeholder="Ask Inbox Zero for something"
            onSend={() => undefined}
            onStop={() => undefined}
          />
        </SpecimenRow>
        <SpecimenRow label="disabled">
          <StaticComposer
            disabled
            placeholder="Inbox Zero is waiting on your answer"
            onSend={() => undefined}
          />
        </SpecimenRow>
        <SpecimenRow label="queuedMessages">
          <StaticComposer
            status="streaming"
            queuedMessages={QUEUED}
            placeholder="Ask Inbox Zero for something"
            onSend={() => undefined}
            onStop={() => undefined}
          />
        </SpecimenRow>
        <SpecimenRow label="canSendEmpty">
          <LiveComposer
            canSendEmpty
            placeholder="Press Enter with nothing typed"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size. The box caps at a 3xl measure and centres itself in whatever column it is given, so the composer lines up with the conversation above it no matter how wide the panel is."
      >
        <SpecimenRow label="Centred in its column">
          <div className="w-full">
            <StaticComposer
              placeholder="Ask Inbox Zero for something"
              onSend={() => undefined}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={chatInputProps} />

      <SpecimenTokens
        classes={[
          "bg-input",
          "bg-chip-subtle",
          "border-line",
          "text-ink",
          "text-ink-muted",
          "hover:bg-hover",
        ]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = ["ChatInput"];

export const specimen: Specimen = {
  id: "chat-input",
  title: "ChatInput",
  group: "Chat",
  render: () => <ChatInputSpecimen />,
};
