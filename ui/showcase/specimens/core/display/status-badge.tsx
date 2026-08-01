import { StatusBadge, StatusDot } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The three `StatusKind`s, in the order the source declares them. */
const CONNECTIONS = [
  { status: "active", label: "Connected", name: "Gmail" },
  { status: "pending", label: "Awaiting approval", name: "Google Calendar" },
  { status: "error", label: "Reconnect needed", name: "Asana" },
] as const;

function StatusBadgeSpecimen() {
  return (
    <SpecimenPage
      title="StatusBadge"
      intro="The one indicator for a connection's live status — a coloured dot, optionally with a label."
    >
      <SpecimenSection
        title="Variants"
        note="`status` is the only variant axis: the three `StatusKind` values. The label is passed in already translated — `ui/` stays language-agnostic."
      >
        {CONNECTIONS.map((one) => (
          <SpecimenRow key={one.status} label={one.status}>
            <StatusBadge status={one.status} label={one.label} />
            <StatusDot status={one.status} srLabel={one.label} />
          </SpecimenRow>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Static by design: no hover, no disabled, no loading. The dot alone is decorative, so a dot-only placement must carry `srLabel`."
      >
        <SpecimenRow label="Dot beside a name">
          {CONNECTIONS.map((one) => (
            <span
              key={one.name}
              className="inline-flex items-center gap-2 text-[15px] leading-[1.55] text-ink"
            >
              <StatusDot status={one.status} srLabel={one.label} />
              {one.name}
            </span>
          ))}
        </SpecimenRow>
        <SpecimenRow label="Dot without srLabel (aria-hidden)">
          <StatusDot status="active" />
          <span className="text-[13px] leading-[1.4] text-ink-muted">
            Only valid when a visible label already names the status.
          </span>
        </SpecimenRow>
        <SpecimenRow label="In a catalog row">
          <div className="flex w-full max-w-sm items-center justify-between gap-4 rounded-2xl border border-line bg-card px-4 py-3">
            <span className="text-[15px] leading-[1.55] text-ink">Asana</span>
            <StatusBadge status="error" label="Reconnect needed" />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size. The dot is `size-1.5` and the label `text-xs`, tuned to sit inline with a 15px row title."
      >
        <SpecimenRow label="Inline with body copy">
          <span className="text-[15px] leading-[1.55] text-ink">
            Meeting Notes
          </span>
          <StatusBadge status="active" label="Running" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "status",
            type: '"active" | "pending" | "error"',
            note: "The `StatusKind`. Required on both StatusBadge and StatusDot.",
          },
          {
            name: "label",
            type: "string",
            note: "StatusBadge only. Already-translated visible text; required.",
          },
          {
            name: "srLabel",
            type: "string",
            note: "StatusDot only. Visually-hidden status text for dot-only placements.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged onto the wrapper (StatusBadge) or the dot (StatusDot).",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-success",
          "bg-warning",
          "bg-danger",
          "text-success",
          "text-warning",
          "text-danger",
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
export const sources: string[] = ["StatusBadge", "StatusDot"];

export const specimen: Specimen = {
  id: "core-status-badge",
  title: "StatusBadge",
  group: "Data display",
  render: () => <StatusBadgeSpecimen />,
};
