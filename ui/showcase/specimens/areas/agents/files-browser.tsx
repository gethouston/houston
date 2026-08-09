import { FilesBrowser } from "@houston-ai/agent";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { FilesStage, LiveFiles } from "./files-browser-parts";
import { agentFiles, FILES_BROWSER_PROPS } from "./files-browser-sample";

function FilesBrowserSpecimen() {
  return (
    <SpecimenPage
      title="FilesBrowser"
      intro="Everything an agent has made or been given, in one expandable list tree."
    >
      <SpecimenSection
        title="Variants"
        note="The list is a tree rooted at the workspace. Expand folders in place, rename a file, or drag one into another folder."
      >
        <SpecimenRow label="Expandable list">
          <LiveFiles />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Selection uses the checkbox gutter and a background click clears it. Rename stays inline on the row. Agent-level actions live on the surrounding accordion row."
      >
        <SpecimenRow label="Loading">
          <LiveFiles loading />
        </SpecimenRow>
        <SpecimenRow label="Empty — the agent has produced nothing yet">
          <FilesStage>
            <FilesBrowser files={[]} onUpload={() => undefined} />
          </FilesStage>
        </SpecimenRow>
        <SpecimenRow label="Read-only — no callbacks, so no actions at all">
          <FilesStage>
            <FilesBrowser files={agentFiles} />
          </FilesStage>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="The browser fills its parent in both directions. Name keeps the flexible column while Modified and Size remain aligned."
      >
        <SpecimenRow label="Narrow frame">
          <div className="flex h-[420px] w-full max-w-md overflow-hidden rounded-2xl border border-line bg-gutter">
            <FilesBrowser files={agentFiles} />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={FILES_BROWSER_PROPS} />

      <SpecimenTokens
        classes={[
          "bg-chip-solid",
          "bg-chip-subtle",
          "bg-hover",
          "bg-input",
          "bg-popover",
          "text-popover-text",
          "bg-action",
          "text-action-text",
          "text-ink",
          "text-ink-muted",
          "text-card-text",
          "text-danger",
          "border-line",
          "ring-focus",
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
export const sources: string[] = ["FilesBrowser"];

export const specimen: Specimen = {
  id: "agents-files-browser",
  title: "FilesBrowser",
  group: "Your Agents",
  render: () => <FilesBrowserSpecimen />,
};
