import {
  ChatThinkingIndicator,
  DEFAULT_THINKING_PHRASES,
} from "@houston-ai/chat";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** What the desktop app passes in: the localized deck, Spanish here. */
const SPANISH_PHRASES = [
  "Houston, tenemos una solución.",
  "Alineando los satélites...",
  "Calentando los propulsores...",
  "Trazando la trayectoria...",
];

function ChatThinkingIndicatorSpecimen() {
  return (
    <SpecimenPage
      title="ChatThinkingIndicator"
      intro="The wait while the agent connects: the mission-log status line playing an astronaut one-liner that changes every few seconds."
    >
      <SpecimenSection
        title="Variants"
        note="`phrases` is the only axis. The built-in English deck keeps `ui/chat` standing alone; the app hands in its localized list, and the deck plays every line once before any repeats."
      >
        <SpecimenRow label="Default deck">
          <ChatThinkingIndicator />
        </SpecimenRow>
        <SpecimenRow label="Localized deck">
          <ChatThinkingIndicator phrases={SPANISH_PHRASES} />
        </SpecimenRow>
        <SpecimenRow label="Single phrase">
          <ChatThinkingIndicator phrases={["Reading your inbox..."]} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="It has one job and one state: mounted means connecting. A phrase rotates in every ~4s behind the shimmer; the moment the agent starts executing, an active mission log replaces this line with the concrete task (PRODUCT-1226). An empty deck leaves the helmet with no line, which is the honest rendering of a caller that passed nothing."
      >
        <SpecimenRow label="Empty deck">
          <ChatThinkingIndicator phrases={[]} />
        </SpecimenRow>
        <SpecimenRow label="Long phrase truncates">
          <ChatThinkingIndicator
            phrases={[
              "Working through every message Stripe sent Inbox Zero this week",
            ]}
          />
        </SpecimenRow>
        <SpecimenRow label="In the log, under the last turn">
          <div className="flex w-full max-w-md flex-col gap-2">
            <p className="text-ink text-sm">
              Filed the three receipts. Nothing else needed you.
            </p>
            <ChatThinkingIndicator />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size, shared with the mission-log header: it IS `ChatStatusLine` (13px helmet, text-xs, shimmer), so the loading row and the Mission log row read as one component (PRODUCT-1226)."
      >
        <SpecimenRow label="Fixed row">
          <ChatThinkingIndicator phrases={DEFAULT_THINKING_PHRASES} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "phrases",
            type: "string[]",
            note: "The rotating one-liners, already translated. Defaults to `DEFAULT_THINKING_PHRASES`, the built-in English set.",
          },
        ]}
      />

      <SpecimenTokens classes={["text-ink-muted"]} />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = [
  "ChatThinkingIndicator",
  "DEFAULT_THINKING_PHRASES",
];

export const specimen: Specimen = {
  id: "chat-thinking-indicator",
  title: "ChatThinkingIndicator",
  group: "Chat",
  render: () => <ChatThinkingIndicatorSpecimen />,
};
