import { ToolBlock, ToolsAndCards } from "@houston-ai/chat";
import type { ReactNode } from "react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  BASH_TOOL,
  FAILED_TOOL,
  RUNNING_TOOL,
  SAMPLE_TOOLS,
} from "./sample-chat";

/** Tool rows are full-width lines in the log, so every row gets a measure. */
function Log({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-md">{children}</div>;
}

function ChatToolBlockSpecimen() {
  return (
    <SpecimenPage
      title="ToolBlock"
      intro="What the agent is doing, one line at a time: a verb a non-technical reader understands, with the raw work folded away behind it."
    >
      <SpecimenSection
        title="Variants"
        note="One row per tool call. The verb comes from the tool name and the tense from whether a result arrived, so nothing ever leaks a raw `integration_execute` into the log."
      >
        <SpecimenRow label="Finished">
          <Log>
            <ToolBlock tool={SAMPLE_TOOLS[1]} isActive={false} />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="Running (isActive)">
          <Log>
            <ToolBlock tool={RUNNING_TOOL} isActive />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="Failed result">
          <Log>
            <ToolBlock tool={FAILED_TOOL} isActive={false} />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="Shell (stays collapsed)">
          <Log>
            <ToolBlock tool={BASH_TOOL} isActive />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="toolLabels override">
          <Log>
            <ToolBlock
              tool={SAMPLE_TOOLS[1]}
              isActive={false}
              toolLabels={{ integration_execute: "Tidied up Gmail" }}
            />
          </Log>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`ToolsAndCards` is the list a turn actually renders. Expanding a row shows the tool's own content: terminal chrome for a command, red/green lines for an edit. Those tones are the CONTENT of a terminal and a diff, not chrome the design system paints."
      >
        <SpecimenRow label="Settled turn">
          <Log>
            <ToolsAndCards tools={SAMPLE_TOOLS} isStreaming={false} />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="Streaming, last tool running">
          <Log>
            <ToolsAndCards
              tools={[...SAMPLE_TOOLS.slice(0, 2), RUNNING_TOOL]}
              isStreaming
            />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="Streaming, every tool done">
          <Log>
            <ToolsAndCards tools={SAMPLE_TOOLS} isStreaming />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="isSpecialTool + renderToolResult">
          <Log>
            <ToolsAndCards
              tools={SAMPLE_TOOLS}
              isStreaming={false}
              isSpecialTool={(name) => name === "integration_search"}
              renderToolResult={(tool) => (
                <div className="rounded-xl border border-line bg-chip px-3 py-2 text-ink text-sm">
                  Looked through your apps for “{String(tool.name)}” and found
                  three Gmail actions.
                </div>
              )}
            />
          </Log>
        </SpecimenRow>
        <SpecimenRow label="No tools">
          <Log>
            <ToolsAndCards tools={[]} isStreaming={false} />
          </Log>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "tool",
            type: "ToolEntry",
            note: "ToolBlock. `{ name, input?, result? }`. A missing `result` is what makes the row unfinished.",
          },
          {
            name: "isActive",
            type: "boolean",
            note: "ToolBlock. This is the call running right now: the label shimmers and the row auto-opens, then auto-closes ~800ms after the result lands. A row the user opened by hand never auto-closes.",
          },
          {
            name: "toolLabels",
            type: "Record<string, string>",
            note: "Both. Overrides the built-in verb by short tool name. The app leaves it unset, so verbs read in English in every locale.",
          },
          {
            name: "tools",
            type: "ToolEntry[]",
            note: "ToolsAndCards. The turn's calls, in the order they ran.",
          },
          {
            name: "isStreaming",
            type: "boolean",
            note: "ToolsAndCards. The turn is still running: the last resultless call becomes the active row, and a fully-resolved list adds the shimmering wrap-up line.",
          },
          {
            name: "isSpecialTool",
            type: "(toolName: string) => boolean",
            note: "ToolsAndCards. Claims a tool for custom rendering. Defaults to claiming none.",
          },
          {
            name: "renderToolResult",
            type: "(tool: ToolEntry, index: number) => ReactNode",
            note: "ToolsAndCards. Renders the claimed tools that have a result, in place of their row.",
          },
        ]}
      />

      <SpecimenTokens
        classes={["text-ink-muted", "hover:text-ink", "text-ink-muted/50"]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = ["ToolBlock", "ToolsAndCards"];

export const specimen: Specimen = {
  id: "chat-tool-block",
  title: "ToolBlock",
  group: "Chat",
  render: () => <ChatToolBlockSpecimen />,
};
