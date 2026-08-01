import { AsyncButton } from "@houston-ai/core";
import { Play, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** Stands in for the network round trip the real handlers await. */
function settleIn(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The whole point of the component, live: hold the click down and mash it,
 * the counter still moves one at a time, because the in-flight guard flips on
 * the first click rather than waiting for `disabled` to commit.
 */
function RageClickDemo({ spinner }: { spinner?: boolean }) {
  const [runs, setRuns] = useState(0);
  const publish = useCallback(async () => {
    await settleIn(1400);
    setRuns((count) => count + 1);
  }, []);

  return (
    <>
      <AsyncButton onClick={publish} spinner={spinner}>
        <Upload />
        Publish Inbox Zero
      </AsyncButton>
      <span className="text-ink-muted text-sm tabular-nums">
        {runs} publish{runs === 1 ? "" : "es"} completed
      </span>
    </>
  );
}

/** A handler that returns nothing never enters the pending state. */
function SyncHandlerDemo() {
  const [renames, setRenames] = useState(0);
  return (
    <>
      <AsyncButton
        variant="outline"
        onClick={() => {
          setRenames((count) => count + 1);
        }}
      >
        Rename agent
      </AsyncButton>
      <span className="text-ink-muted text-sm tabular-nums">
        {renames} rename{renames === 1 ? "" : "s"}, no pending state
      </span>
    </>
  );
}

/** Button's six, all of them: AsyncButton forwards `variant` untouched. */
const VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;
const SIZES = ["xs", "sm", "default", "lg"] as const;

const props: readonly SpecimenProp[] = [
  {
    name: "onClick",
    type: "(event: React.MouseEvent<HTMLButtonElement>) => void | Promise<unknown>",
    note: "Return the promise, don't `void` it, or the button can't tell when the work settles.",
  },
  {
    name: "spinner",
    type: "boolean",
    note: "Leading spinner while pending. Defaults to `true`.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "OR-ed with the pending state, so it never un-disables mid-flight.",
  },
  {
    name: "...props",
    type: 'Omit<React.ComponentProps<typeof Button>, "onClick">',
    note: "Every Button prop (`variant`, `size`, `asChild`) passes straight through.",
  },
];

const tokens = [
  "bg-action",
  "text-action-text",
  "bg-danger",
  "bg-input",
  "border-line-input",
  "bg-hover",
  "text-hover-text",
  "bg-chip",
  "text-chip-text",
  "ring-focus",
];

function AsyncButtonSpecimen() {
  return (
    <SpecimenPage
      title="Async button"
      intro="A Button that disables itself for the length of the promise its handler returns, so a rage click can only fire the action once."
    >
      <SpecimenSection
        title="Variants"
        note="It has no variants of its own; it renders Button, so every Button variant is available and looks identical at rest."
      >
        {VARIANTS.map((variant) => (
          <SpecimenRow key={variant} label={variant}>
            <AsyncButton
              variant={variant}
              onClick={() => settleIn(1400)}
              aria-label={`Run once, ${variant}`}
            >
              {variant === "destructive" ? <Trash2 /> : <Play />}
              {variant === "destructive" ? "Delete agent" : "Run once"}
            </AsyncButton>
          </SpecimenRow>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Every row is live. Pending lasts 1.4s here; the button takes no further clicks until the promise settles, resolved or rejected."
      >
        <SpecimenRow label="Idle">
          <AsyncButton onClick={() => settleIn(1400)}>
            <RefreshCw />
            Sync now
          </AsyncButton>
        </SpecimenRow>
        <SpecimenRow label="Pending (click it)">
          <RageClickDemo />
        </SpecimenRow>
        <SpecimenRow label="Pending, spinner={false}">
          <RageClickDemo spinner={false} />
        </SpecimenRow>
        <SpecimenRow label="Sync handler">
          <SyncHandlerDemo />
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <AsyncButton disabled onClick={() => settleIn(1400)}>
            <Upload />
            Publish Inbox Zero
          </AsyncButton>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Forwarded to Button unchanged; the spinner sizes with the label."
      >
        {SIZES.map((size) => (
          <SpecimenRow key={size} label={size}>
            <AsyncButton size={size} onClick={() => settleIn(1400)}>
              <RefreshCw />
              Sync now
            </AsyncButton>
          </SpecimenRow>
        ))}
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens classes={tokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["AsyncButton"];

export const specimen: Specimen = {
  id: "core-async-button",
  title: "Async button",
  group: "Actions & inputs",
  render: () => <AsyncButtonSpecimen />,
};
