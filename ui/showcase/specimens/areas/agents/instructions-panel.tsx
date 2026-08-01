import type { InstructionFile } from "@houston-ai/agent";
import { InstructionsPanel } from "@houston-ai/agent";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The panel fills its parent, so a specimen has to give it a real frame. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[360px] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-gutter">
      {children}
    </div>
  );
}

const claudeMd: InstructionFile = {
  name: "CLAUDE.md",
  label: "CLAUDE.md",
  content:
    "You triage Julian's inbox every weekday at 07:30.\n\nDraft replies for anything a client sent, file receipts under Finance, and never send without approval.",
};

const soundsLike: InstructionFile = {
  name: "SOUNDS-LIKE.md",
  label: "How you sound",
  content:
    "Short sentences. No corporate filler. Sign off as Julian, never as an assistant.",
};

/**
 * `onSave` is the whole contract: the panel keeps a local draft, and on blur it
 * hands the changed content back and shows "Saving…" until the promise settles.
 * Faking that with an instant resolve would hide the one state worth reviewing,
 * so this one takes a beat and then keeps the edit.
 */
function LivePanel({ initial }: { initial: readonly InstructionFile[] }) {
  const [files, setFiles] = useState([...initial]);
  return (
    <Stage>
      <InstructionsPanel
        files={files}
        onSave={(name, content) =>
          new Promise((done) => {
            setTimeout(() => {
              setFiles((all) =>
                all.map((file) =>
                  file.name === name ? { ...file, content } : file,
                ),
              );
              done();
            }, 900);
          })
        }
      />
    </Stage>
  );
}

function InstructionsPanelSpecimen() {
  return (
    <SpecimenPage
      title="InstructionsPanel"
      intro="The agent's job description in plain language — the instruction files behind Agent Settings, edited in place."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. The panel is one labelled field per file in `files` order, and one file or five is the only structural difference. Edit a field and click away: the label grows a Saving… note until the save resolves."
      >
        <SpecimenRow label="One file">
          <LivePanel initial={[claudeMd]} />
        </SpecimenRow>
        <SpecimenRow label="Several files">
          <LivePanel initial={[claudeMd, soundsLike]} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Three: resting, focused, and saving. The field fills with the chip surface at rest, brightens its hairline on hover, and swaps to the input surface on focus. An empty file shows the placeholder rather than an empty box."
      >
        <SpecimenRow label="Empty file — placeholder">
          <LivePanel
            initial={[{ name: "CLAUDE.md", label: "CLAUDE.md", content: "" }]}
          />
        </SpecimenRow>
        <SpecimenRow label="No files at all — the panel's own empty state">
          <Stage>
            <InstructionsPanel
              files={[]}
              onSave={() => Promise.resolve()}
              emptyTitle="No instructions yet"
              emptyDescription="Tell Inbox Zero what its mornings look like and it will follow that from the next run."
            />
          </Stage>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One width — the panel fills its column — and a height that follows the text: the textarea's `rows` tracks the line count, with a floor of four, so a long instruction never needs an inner scrollbar."
      >
        <SpecimenRow label="Short content / long content">
          <LivePanel
            initial={[
              { name: "SHORT.md", label: "Short", content: "Be brief." },
              {
                name: "LONG.md",
                label: "Long",
                content: Array.from(
                  { length: 8 },
                  (_, i) => `Rule ${i + 1}: one line of the agent's brief.`,
                ).join("\n"),
              },
            ]}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "files",
            type: "InstructionFile[]",
            note: "{ name, label, content }. `name` is the save key and the field id; `label` is what the user reads.",
          },
          {
            name: "onSave",
            type: "(name: string, content: string) => Promise<void>",
            note: "Required. Fires on blur, only when the content actually changed. The pending promise is what shows Saving….",
          },
          {
            name: "emptyTitle",
            type: "string",
            note: 'Defaults to "No instructions yet".',
          },
          {
            name: "emptyDescription",
            type: "string",
            note: "The line under it. Both shown only when `files` is empty.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip",
          "bg-input",
          "text-ink",
          "text-ink-muted",
          "border-ink/[0.04]",
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
export const sources: string[] = ["InstructionsPanel"];

export const specimen: Specimen = {
  id: "agents-instructions-panel",
  title: "InstructionsPanel",
  group: "Your Agents",
  render: () => <InstructionsPanelSpecimen />,
};
