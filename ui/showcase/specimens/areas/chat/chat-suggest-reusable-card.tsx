import {
  ChatSuggestReusableCard,
  DEFAULT_SUGGEST_REUSABLE_LABELS,
} from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";
import { useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** A card whose two rows really fire, echoing which one the user picked. */
function LiveCard({
  reusableKind,
  title,
  rationale,
  disabled,
}: {
  reusableKind: "skill" | "routine" | "learning";
  title: string;
  rationale: string;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="w-full max-w-lg">
      <ChatSuggestReusableCard
        reusableKind={reusableKind}
        title={title}
        rationale={rationale}
        disabled={disabled}
        labels={DEFAULT_SUGGEST_REUSABLE_LABELS}
        onSave={() => setPicked("Save")}
        onDismiss={() => setPicked("Not now")}
      />
      <p className={cn(storeType.meta, "pt-2")}>
        {picked === null ? "Nothing picked yet." : `Picked: ${picked}`}
      </p>
    </div>
  );
}

function ChatSuggestReusableCardSpecimen() {
  return (
    <SpecimenPage
      title="ChatSuggestReusableCard"
      intro="The work went well and might go well again: an offer to keep it, made once, and easy to wave off."
    >
      <SpecimenSection
        title="Variants"
        note="`reusableKind` is the axis. It picks both the save verb and its glyph: know-how worth repeating is a Skill, work worth scheduling is an Automation, and something worth remembering is a Learning."
      >
        <SpecimenRow label='reusableKind="skill"'>
          <LiveCard
            reusableKind="skill"
            title="File Stripe receipts"
            rationale="You have asked for this three times this month."
          />
        </SpecimenRow>
        <SpecimenRow label='reusableKind="routine"'>
          <LiveCard
            reusableKind="routine"
            title="Weekly receipt tidy-up"
            rationale="Stripe sends receipts every Monday, so this could just run."
          />
        </SpecimenRow>
        <SpecimenRow label='reusableKind="learning"'>
          <LiveCard
            reusableKind="learning"
            title="December invoices stay in the inbox"
            rationale="You told me to leave them for you to check."
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`disabled` gates both rows at once while another turn owns the conversation. The offer is never modal and never sticky: Not now is a real, equal row, not a quiet dismiss."
      >
        <SpecimenRow label="disabled">
          <LiveCard
            disabled
            reusableKind="skill"
            title="File Stripe receipts"
            rationale="You have asked for this three times this month."
          />
        </SpecimenRow>
        <SpecimenRow label="Long rationale">
          <LiveCard
            reusableKind="routine"
            title="Weekly receipt tidy-up"
            rationale="Every Monday you ask Inbox Zero to file the receipts Stripe sent over the weekend, and every time the result is the same three labels."
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "reusableKind",
            type: '"skill" | "routine" | "learning"',
            note: "What the work is offered as. Picks the save row's label and its glyph.",
          },
          {
            name: "title",
            type: "string",
            note: "The model's proposed name, raised as the card's head.",
          },
          {
            name: "rationale",
            type: "string",
            note: "The model's one-line reason for offering it, passed through as written.",
          },
          {
            name: "onSave",
            type: "() => void",
            note: "Sends the follow-up that asks the agent to write the Skill, Automation or Learning.",
          },
          {
            name: "onDismiss",
            type: "() => void",
            note: "Drops the offer locally and returns the composer.",
          },
          {
            name: "disabled",
            type: "boolean",
            note: "Gates both rows uniformly and dims the card. Defaults to false.",
          },
          {
            name: "labels",
            type: "ChatSuggestReusableLabels",
            note: "Required. Already-translated strings; `DEFAULT_SUGGEST_REUSABLE_LABELS` is the English fallback.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip",
          "bg-input",
          "border-line",
          "hover:bg-hover",
          "focus-visible:border-focus",
          "focus-visible:ring-focus",
          "text-ink",
          "text-ink-muted",
        ]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = [
  "ChatSuggestReusableCard",
  "DEFAULT_SUGGEST_REUSABLE_LABELS",
];

export const specimen: Specimen = {
  id: "chat-suggest-reusable-card",
  title: "ChatSuggestReusableCard",
  group: "Chat",
  render: () => <ChatSuggestReusableCardSpecimen />,
};
