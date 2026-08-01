import { ChatPlanReadyCard, DEFAULT_PLAN_READY_LABELS } from "@houston-ai/chat";
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

/** The plan Inbox Zero drafted before touching anything. */
const PLAN = `I will read the last 30 days of mail from Stripe, file every receipt under a new "Receipts" label, and leave anything that looks like an unpaid invoice in the inbox for you.`;

/** Spanish labels, to show the card carries no English of its own. */
const SPANISH_LABELS = {
  title: "Plan listo",
  collapse: "Contraer la aprobación del plan",
  expand: "Expandir la aprobación del plan",
  askFirstTitle: "Seguir en modo Preguntar primero",
  askFirstDescription: "Avanza solo, pregunta antes de acciones delicadas.",
  autopilotTitle: "Seguir en modo Piloto automático",
  autopilotDescription: "Lo termina por su cuenta, sin preguntar.",
  dismiss: "Descartar",
  feedbackPlaceholder: "Pide un cambio al plan...",
  send: "Enviar",
};

/** A card whose three rows really fire, echoing which one the user picked. */
function LiveCard({ disabled }: { disabled?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="w-full max-w-lg">
      <ChatPlanReadyCard
        summary={PLAN}
        disabled={disabled}
        labels={DEFAULT_PLAN_READY_LABELS}
        onStartWorking={() => setPicked("Ask first")}
        onRunAutopilot={() => setPicked("Autopilot")}
        onDismiss={() => setPicked("Dismissed")}
        onSubmit={(text) => setPicked(`Feedback: ${text}`)}
      />
      <p className={cn(storeType.meta, "pt-2")}>
        {picked === null ? "Nothing picked yet." : `Picked: ${picked}`}
      </p>
    </div>
  );
}

function ChatPlanReadyCardSpecimen() {
  return (
    <SpecimenPage
      title="ChatPlanReadyCard"
      intro="The agent has a plan and wants a decision: it takes the composer's place until the user picks how the work should run."
    >
      <SpecimenSection
        title="Variants"
        note="One shape: two action rows (Ask first, Autopilot) and a feedback composer for changing the plan. Emphasis comes from row order and title weight, never from a filled button, so nothing shouts at a user being asked to commit."
      >
        <SpecimenRow label="Default labels">
          <LiveCard />
        </SpecimenRow>
        <SpecimenRow label="Localized labels">
          <div className="w-full max-w-lg">
            <ChatPlanReadyCard
              summary="Voy a revisar el correo de Stripe del último mes y archivar cada recibo."
              labels={SPANISH_LABELS}
              onStartWorking={() => undefined}
              onRunAutopilot={() => undefined}
              onSubmit={() => undefined}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Short plan">
          <div className="w-full max-w-lg">
            <ChatPlanReadyCard
              summary="I will archive everything Stripe sent before June."
              labels={DEFAULT_PLAN_READY_LABELS}
              onStartWorking={() => undefined}
              onRunAutopilot={() => undefined}
              onSubmit={() => undefined}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`disabled` is the only state, and it gates all three rows at once: while another turn is running the whole card reads as inert rather than offering a choice that would be dropped."
      >
        <SpecimenRow label="disabled">
          <LiveCard disabled />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "summary",
            type: "string",
            note: "The plan the agent drafted, raised as the card's head. Model-written prose, passed through as-is.",
          },
          {
            name: "onStartWorking",
            type: "() => void",
            note: "Sends the plan as a normal turn (execute).",
          },
          {
            name: "onRunAutopilot",
            type: "() => void",
            note: "Sends the plan as an Autopilot turn (auto).",
          },
          {
            name: "onSubmit",
            type: "(text: string) => void",
            note: "Sends the feedback composer's text as a plan revision; the agent stays in plan mode.",
          },
          {
            name: "onDismiss",
            type: "() => void",
            note: "Optional. Dismisses the card locally and returns the composer.",
          },
          {
            name: "disabled",
            type: "boolean",
            note: "Gates both action rows and the composer uniformly and dims the card. Defaults to false.",
          },
          {
            name: "labels",
            type: "ChatPlanReadyLabels",
            note: "Required. Every string on the card, already translated. `DEFAULT_PLAN_READY_LABELS` is the English fallback.",
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
  "ChatPlanReadyCard",
  "DEFAULT_PLAN_READY_LABELS",
];

export const specimen: Specimen = {
  id: "chat-plan-ready-card",
  title: "ChatPlanReadyCard",
  group: "Chat",
  render: () => <ChatPlanReadyCardSpecimen />,
};
