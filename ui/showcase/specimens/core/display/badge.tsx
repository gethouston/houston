import { Badge } from "@houston-ai/core";
import { CheckIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * Badge — the six `badgeVariants` from the source, nothing invented. The
 * `[a&]:hover:*` rules only fire when the badge renders AS a link (`asChild`
 * around an `<a>`), so hover lives in its own row rather than a note nobody
 * can check.
 */
function BadgeSpecimen() {
  return (
    <SpecimenPage
      title="Badge"
      intro="A pill for one word of metadata: a state, a count, a category."
    >
      <SpecimenSection
        title="Variants"
        note="Every value of the `variant` prop. `default` is the default."
      >
        <SpecimenRow label="default">
          <Badge>Live</Badge>
          <Badge variant="default">4 runs today</Badge>
        </SpecimenRow>
        <SpecimenRow label="secondary">
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="secondary">Productivity</Badge>
        </SpecimenRow>
        <SpecimenRow label="destructive">
          <Badge variant="destructive">Failed</Badge>
          <Badge variant="destructive">3 errors</Badge>
        </SpecimenRow>
        <SpecimenRow label="outline">
          <Badge variant="outline">Beta</Badge>
          <Badge variant="outline">Gmail</Badge>
        </SpecimenRow>
        <SpecimenRow label="ghost">
          <Badge variant="ghost">Paused</Badge>
          <Badge variant="ghost">Archived</Badge>
        </SpecimenRow>
        <SpecimenRow label="link">
          <Badge variant="link">@julian</Badge>
          <Badge variant="link">View run</Badge>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A badge is not interactive on its own — hover styling only applies when it renders as an anchor via `asChild`."
      >
        <SpecimenRow label="With an icon">
          <Badge>
            <CheckIcon /> Connected
          </Badge>
          <Badge variant="secondary">
            <SparklesIcon /> New
          </Badge>
          <Badge variant="destructive">
            <TriangleAlertIcon /> Needs attention
          </Badge>
        </SpecimenRow>
        <SpecimenRow label="As a link (hover me)">
          <Badge asChild variant="outline">
            <a href="#core-badge">Inbox Zero</a>
          </Badge>
          <Badge asChild variant="ghost">
            <a href="#core-badge">Meeting Notes</a>
          </Badge>
          <Badge asChild variant="link">
            <a href="#core-badge">@julian</a>
          </Badge>
        </SpecimenRow>
        <SpecimenRow label="Invalid (aria-invalid)">
          <Badge aria-invalid>Missing scope</Badge>
          <Badge aria-invalid variant="outline">
            Missing scope
          </Badge>
        </SpecimenRow>
        <SpecimenRow label="Long label (never wraps)">
          <Badge variant="secondary">
            Waiting on Google Calendar authorisation
          </Badge>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Badge ships one size. Type scale comes from the pill itself (`text-xs`); it inherits nothing from the parent."
      >
        <SpecimenRow label="Beside 15px body copy">
          <span className="text-[15px] leading-[1.55] text-ink">
            Inbox Zero
          </span>
          <Badge variant="secondary">Productivity</Badge>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "variant",
            type: '"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"',
            note: 'Defaults to "default"; also mirrored onto `data-variant`.',
          },
          {
            name: "asChild",
            type: "boolean",
            note: "Renders the single child instead of a `<span>` — use it for anchors.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged after the variant classes, so it wins.",
          },
          {
            name: "...props",
            type: 'React.ComponentProps<"span">',
            note: "Every remaining span attribute, including `aria-invalid`.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-action",
          "text-action-text",
          "bg-chip",
          "text-chip-text",
          "bg-danger",
          "text-white",
          "border-line",
          "text-ink",
          "hover:bg-hover",
          "hover:text-hover-text",
          "text-action",
          "border-focus",
          "ring-focus/50",
          "border-danger",
          "ring-danger/20",
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
export const sources: string[] = ["Badge"];

export const specimen: Specimen = {
  id: "core-badge",
  title: "Badge",
  group: "Data display",
  render: () => <BadgeSpecimen />,
};
