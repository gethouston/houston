import { type ConversationEntry, ConversationList } from "@houston-ai/board";
import { storeType } from "@houston-ai/store";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { CONVERSATIONS } from "./sample";

/** `updatedAt` is rendered as an offset from now, so the fixture is one too. */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** The agent's main chat plus two of its missions, freshly stamped. */
const ENTRIES: ConversationEntry[] = CONVERSATIONS.map((entry, index) => ({
  ...entry,
  updatedAt: ago([2, 95, 3 * 24 * 60][index]),
}));

/** Every status the list words, plus one it has never heard of. */
const STATUSES: ConversationEntry[] = [
  "running",
  "needs_you",
  "done",
  "cancelled",
  "queued",
].map((status, index) => ({
  ...CONVERSATIONS[1],
  id: `c-${status}`,
  title: `Mission in ${status}`,
  status,
  updatedAt: ago(index * 30),
}));

function ConversationListSpecimen() {
  return (
    <SpecimenPage
      title="ConversationList"
      intro="One agent's conversations in a flat list: its main chat first, then the mission threads, each with when it last moved and where it stands."
    >
      <SpecimenSection
        title="Variants"
        note="`type` is the variant axis and it is deliberately quiet: the primary chat earns a leading speech-bubble glyph, an activity conversation gets none. Everything else about the two rows is identical, because they are the same thing to the reader."
      >
        <SpecimenRow label="Primary and activity">
          <div className="w-full max-w-lg">
            <ConversationList entries={ENTRIES} onSelect={() => {}} />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Status maps to a badge variant and an English word from tables inside the component. A status it does not know falls through to the outline badge with the raw value shown, so a consumer's own vocabulary never renders a blank chip."
      >
        <SpecimenRow label="Status">
          <div className="w-full max-w-lg">
            <ConversationList entries={STATUSES} onSelect={() => {}} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Empty">
          <div className="w-full max-w-lg">
            <ConversationList entries={[]} onSelect={() => {}} />
          </div>
          <span className={storeType.meta}>
            No rows and no empty state — the list is a plain stack, so the
            screen around it owns that.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size: rows fill their container and the title truncates rather than wrapping, so the time and the status badge on the right never move."
      >
        <SpecimenRow label="In a narrow pane">
          <div className="w-full max-w-xs">
            <ConversationList entries={ENTRIES} onSelect={() => {}} />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "entries",
            type: "ConversationEntry[]",
            note: "Rendered in the order given — the list does no sorting of its own.",
          },
          {
            name: "onSelect",
            type: "(entry: ConversationEntry) => void",
            note: "The whole row is the target. `sessionKey` is what the consumer opens.",
          },
        ]}
      />

      <SpecimenTokens
        classes={["bg-card", "border-ink/5", "text-ink", "text-ink-muted"]}
      />
    </SpecimenPage>
  );
}

export const sources: string[] = ["ConversationList"];

export const specimen: Specimen = {
  id: "board-conversation-list",
  title: "ConversationList",
  group: "Activity",
  render: () => <ConversationListSpecimen />,
};
