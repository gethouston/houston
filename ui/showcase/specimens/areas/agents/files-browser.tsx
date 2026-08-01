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
      intro="Everything an agent has made or been given: a Drive-style card grid by default, with the Finder-style tree behind a toggle."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — two views, and which one shows is `view` (or the browser's own state when you leave it uncontrolled). The grid navigates folder by folder through the breadcrumb; the list is a tree rooted at the workspace, which is why it carries no breadcrumb of its own. Both below are live: open a folder, rename a file, drag one into another folder."
      >
        <SpecimenRow label="Grid — the default">
          <LiveFiles />
        </SpecimenRow>
        <SpecimenRow label="List — sortable columns, expandable tree">
          <LiveFiles startView="list" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Selection is a controlled path; a click on the background clears it. Rename is inline on the row or card. The header's actions are opt-in: every one of them appears only because its callback was passed, which is how the same component serves the desktop (reveal in Finder) and the browser (download a zip)."
      >
        <SpecimenRow label="Loading">
          <LiveFiles loading />
        </SpecimenRow>
        <SpecimenRow label="Empty — the agent has produced nothing yet">
          <FilesStage>
            <FilesBrowser
              files={[]}
              rootLabel="Meeting Notes"
              emptyTitle="No files yet"
              emptyDescription="When Meeting Notes writes a summary, it will appear here."
              onBrowse={() => undefined}
              onUploadFolder={() => undefined}
            />
          </FilesStage>
        </SpecimenRow>
        <SpecimenRow label="Read-only — no callbacks, so no actions at all">
          <FilesStage>
            <FilesBrowser files={agentFiles} rootLabel="Weekly Report" />
          </FilesStage>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="The browser fills its parent in both directions, and caps its own content to a 896px column so the header and the body stay aligned on a wide window. Card and row heights are fixed; only the number of columns responds."
      >
        <SpecimenRow label="Narrow frame — the grid reflows to fewer columns">
          <div className="flex h-[420px] w-full max-w-md overflow-hidden rounded-2xl border border-line bg-gutter">
            <FilesBrowser files={agentFiles} rootLabel="Inbox Zero" />
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
