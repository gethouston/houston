import { Alert, AlertDescription, AlertTitle, Button } from "@houston-ai/core";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function AlertSpecimen() {
  return (
    <SpecimenPage
      title="Alert"
      intro="A standing message about the surface you are on — not a toast, it does not go away."
    >
      <SpecimenSection
        title="Variants"
        note="Both values of `variant`. Neither tints the background: the card colour stays, and only `destructive` shifts the text to the danger token."
      >
        <SpecimenRow label="default">
          <Alert className="w-full max-w-md">
            <InfoIcon />
            <AlertTitle>Inbox Zero runs every morning at 8:00</AlertTitle>
            <AlertDescription>
              Change the schedule any time from the agent's settings.
            </AlertDescription>
          </Alert>
        </SpecimenRow>
        <SpecimenRow label="destructive">
          <Alert variant="destructive" className="w-full max-w-md">
            <TriangleAlertIcon />
            <AlertTitle>Gmail disconnected</AlertTitle>
            <AlertDescription>
              Inbox Zero stopped after 3 failed runs. Reconnect the account to
              resume it.
            </AlertDescription>
          </Alert>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note={
          'Static: no hover, focus or dismiss behaviour — it renders `role="alert"` and stays until the condition clears. The grid collapses its icon column automatically when there is no `<svg>` child.'
        }
      >
        <SpecimenRow label="Title only">
          <Alert className="w-full max-w-md">
            <InfoIcon />
            <AlertTitle>Meeting Notes is paused</AlertTitle>
          </Alert>
        </SpecimenRow>
        <SpecimenRow label="Without an icon">
          <Alert className="w-full max-w-md">
            <AlertTitle>Meeting Notes is paused</AlertTitle>
            <AlertDescription>
              The icon column collapses, so the text stays flush left.
            </AlertDescription>
          </Alert>
        </SpecimenRow>
        <SpecimenRow label="With an action in the description">
          <Alert variant="destructive" className="w-full max-w-md">
            <TriangleAlertIcon />
            <AlertTitle>Weekly Report could not read the sheet</AlertTitle>
            <AlertDescription>
              <p>The sheet was moved or its sharing changed.</p>
              <Button variant="outline" size="sm">
                Reconnect Sheets
              </Button>
            </AlertDescription>
          </Alert>
        </SpecimenRow>
        <SpecimenRow label="Long title (clamped to one line)">
          <Alert className="w-full max-w-md">
            <InfoIcon />
            <AlertTitle>
              Inbox Zero, Meeting Notes and Weekly Report all share the same
              Google account and will reconnect together
            </AlertTitle>
            <AlertDescription>
              The title is `line-clamp-1` by design — put the detail here.
            </AlertDescription>
          </Alert>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size: 16px gutters, 12px vertical padding, 14px text. Width comes from the parent — an alert is always full-bleed inside its column."
      >
        <SpecimenRow label="Narrow column">
          <Alert className="w-64">
            <InfoIcon />
            <AlertTitle>Paused</AlertTitle>
            <AlertDescription>Resume it from the sidebar.</AlertDescription>
          </Alert>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "variant",
            type: '"default" | "destructive"',
            note: 'Defaults to "default".',
          },
          {
            name: "Alert ...props",
            type: 'React.ComponentProps<"div">',
            note: 'Renders `role="alert"`. A first-child `<svg>` becomes the leading icon.',
          },
          {
            name: "AlertTitle ...props",
            type: 'React.ComponentProps<"div">',
            note: "Medium weight, clamped to one line.",
          },
          {
            name: "AlertDescription ...props",
            type: 'React.ComponentProps<"div">',
            note: "Muted supporting copy; a grid, so multiple children stack with 4px gaps.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged last on every slot.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-card",
          "text-card-text",
          "text-danger",
          "text-danger/90",
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
export const sources: string[] = ["Alert", "AlertDescription", "AlertTitle"];

export const specimen: Specimen = {
  id: "core-alert",
  title: "Alert",
  group: "Data display",
  render: () => <AlertSpecimen />,
};
