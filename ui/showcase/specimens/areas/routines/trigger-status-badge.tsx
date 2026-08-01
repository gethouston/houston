import { cn } from "@houston-ai/core";
import type { TriggerStatusItem } from "@houston-ai/routines";
import { RoutineTriggerStatus, TriggerStatusBadge } from "@houston-ai/routines";
import { storeSurface } from "@houston-ai/store";
import type { ReactNode } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { meetingNotes } from "./sample";
import { badgeProps } from "./trigger-status-badge-parts";

/** The five wire states, in the order a routine degrades through them. */
const states: TriggerStatusItem["status"][] = [
  "active",
  "pending",
  "paused_disconnected",
  "paused_revoked",
  "error",
];

const status = (
  state: TriggerStatusItem["status"],
  detail?: string,
): TriggerStatusItem => ({
  routine_id: meetingNotes.id,
  status: state,
  detail,
});

/** The detail block sits in the chat header, so give it that column width. */
function Block({ children }: { children: ReactNode }) {
  return (
    <div className={cn(storeSurface.panel, "w-full max-w-sm")}>{children}</div>
  );
}

function TriggerStatusBadgeSpecimen() {
  return (
    <SpecimenPage
      title="TriggerStatusBadge"
      intro="Whether an event-driven routine can actually fire. A dot and a human sentence — never a tinted card, never a technical string, and never nothing."
    >
      <SpecimenSection
        title="Variants"
        note="`withDetail` is the only structural prop. Off (the default) is the compact chip that rides a list row; on is the fuller block the chat header shows, which adds the explanatory line and promotes Reconnect to a secondary button."
      >
        <SpecimenRow label="Compact — the row chip">
          <TriggerStatusBadge status={status("active")} />
        </SpecimenRow>
        <SpecimenRow label="withDetail — the header block">
          <Block>
            <TriggerStatusBadge
              status={status("paused_disconnected")}
              withDetail
              onReconnect={() => {}}
            />
          </Block>
        </SpecimenRow>
        <SpecimenRow label="RoutineTriggerStatus — active but never fired">
          <RoutineTriggerStatus status={status("active")} hasRun={false} />
        </SpecimenRow>
        <SpecimenRow label="RoutineTriggerStatus — active and delivering">
          <RoutineTriggerStatus status={status("active")} hasRun />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Five wire states plus one presentational fallback. A routine with a trigger binding ALWAYS resolves to a chip: with no status yet it renders the muted, hollow-dot “Checking status”, which can never be mistaken for healthy — so a trigger that cannot fire can never hide."
      >
        {states.map((state) => (
          <SpecimenRow key={state} label={state}>
            <TriggerStatusBadge status={status(state)} onReconnect={() => {}} />
          </SpecimenRow>
        ))}
        <SpecimenRow label="unknown (no status yet)">
          <TriggerStatusBadge />
        </SpecimenRow>
        <SpecimenRow label="Host-supplied detail wins over the standing hint">
          <Block>
            <TriggerStatusBadge
              status={status("error", "Google Calendar rejected the webhook.")}
              withDetail
            />
          </Block>
        </SpecimenRow>
        <SpecimenRow label="Standing hint for a revoked toolkit">
          <Block>
            <TriggerStatusBadge status={status("paused_revoked")} withDetail />
          </Block>
        </SpecimenRow>
        <SpecimenRow label="Overridden label, state's own tone">
          <TriggerStatusBadge
            status={status("active")}
            statusLabel="Active. Waiting for the first event."
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={badgeProps} />

      <SpecimenTokens
        classes={[
          "bg-success",
          "bg-warning",
          "bg-danger",
          "bg-ink-muted",
          "border-ink-muted",
          "text-success",
          "text-warning",
          "text-danger",
          "text-ink-muted",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["RoutineTriggerStatus", "TriggerStatusBadge"];

export const specimen: Specimen = {
  id: "routines-trigger-status-badge",
  title: "TriggerStatusBadge",
  group: "Routines",
  render: () => <TriggerStatusBadgeSpecimen />,
};
