import { type QueuedChatMessage, QueuedMessageList } from "@houston-ai/chat";
import { useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** What the user typed while Inbox Zero was still working. */
const QUEUED: QueuedChatMessage[] = [
  { id: "q-1", text: "Also archive anything older than a year." },
  {
    id: "q-2",
    text: "And put the December invoice somewhere I will see it.",
    attachmentNames: ["december-invoice.pdf"],
  },
  { id: "q-3", text: "", attachmentNames: ["receipts.csv", "vendors.csv"] },
];

/** Spanish labels, to show the list carries no English of its own. */
const SPANISH_LABELS = {
  title: "En cola",
  remove: "Quitar mensaje en cola",
  attachmentsOnly: "Archivos",
};

/** A list whose remove control really removes. */
function LiveQueue() {
  const [messages, setMessages] = useState(QUEUED);
  return (
    <div className="w-full max-w-md">
      <QueuedMessageList
        messages={messages}
        onRemove={(id) =>
          setMessages((current) => current.filter((one) => one.id !== id))
        }
      />
      {messages.length === 0 && (
        <p className="text-ink-muted text-xs">
          Nothing queued. The list renders nothing at all when it is empty.
        </p>
      )}
    </div>
  );
}

function ChatQueuedMessagesSpecimen() {
  return (
    <SpecimenPage
      title="QueuedMessageList"
      intro="What you said while the agent was still working: held above the composer, visible, and removable before it goes."
    >
      <SpecimenSection
        title="Variants"
        note="Each row is one queued message. Text is what normally shows; a message that was only files says so instead, and the file names sit under whichever it is."
      >
        <SpecimenRow label="Text, files, and files-only">
          <div className="w-full max-w-md">
            <QueuedMessageList messages={QUEUED} onRemove={() => undefined} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Localized labels">
          <div className="w-full max-w-md">
            <QueuedMessageList
              messages={QUEUED}
              labels={SPANISH_LABELS}
              onRemove={() => undefined}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`onRemove` is what makes a queued message reversible. Remove every row in the live list below and the whole block disappears: an empty queue renders nothing rather than an empty frame above the composer."
      >
        <SpecimenRow label="Live, removable">
          <LiveQueue />
        </SpecimenRow>
        <SpecimenRow label="Without onRemove">
          <div className="w-full max-w-md">
            <QueuedMessageList messages={QUEUED.slice(0, 2)} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Long message clamps">
          <div className="w-full max-w-md">
            <QueuedMessageList
              messages={[
                {
                  id: "q-long",
                  text: "Also go back through the whole year, find every receipt Stripe ever sent, and put them in one folder per quarter so I can hand the lot to the accountant in January without touching any of it myself.",
                },
              ]}
              onRemove={() => undefined}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "messages",
            type: "QueuedChatMessage[]",
            note: "`{ id, text, attachmentNames? }`. An empty array renders nothing at all.",
          },
          {
            name: "onRemove",
            type: "(id: string) => void",
            note: "Drops one queued message. Omit and the rows carry no remove control.",
          },
          {
            name: "labels",
            type: "QueuedMessageLabels",
            note: 'Already-translated `title`, `remove` and `attachmentsOnly`. English defaults ("Queued", "Remove queued message", "Attachments") stand in.',
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "border-line",
          "bg-chip-subtle",
          "bg-input",
          "text-ink",
          "text-ink-muted",
          "hover:bg-hover",
          "hover:text-ink",
        ]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = ["QueuedMessageList"];

export const specimen: Specimen = {
  id: "chat-queued-messages",
  title: "QueuedMessageList",
  group: "Chat",
  render: () => <ChatQueuedMessagesSpecimen />,
};
