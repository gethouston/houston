import { ChatStatusLine, Shimmer } from "@houston-ai/chat";
import { MailIcon, TerminalIcon } from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function ChatStatusLineSpecimen() {
  return (
    <SpecimenPage
      title="ChatStatusLine"
      intro="The glyph-plus-muted-label line the mission log speaks in, and the shimmer that marks it as still happening."
    >
      <SpecimenSection
        title="Variants"
        note="The helmet is the default glyph — this line IS the chat's Mission log row. Pass `icon` to swap in the tool's own mark when the line stands for one specific action."
      >
        <SpecimenRow label="Default (helmet)">
          <ChatStatusLine label="Mission log" className="text-ink-muted" />
        </SpecimenRow>
        <SpecimenRow label="icon">
          <ChatStatusLine
            label="Gmail · Sending email"
            icon={<MailIcon className="size-3.5" />}
            className="text-ink-muted"
          />
        </SpecimenRow>
        <SpecimenRow label="icon (terminal)">
          <ChatStatusLine
            label="Running command"
            icon={<TerminalIcon className="size-3.5" />}
            className="text-ink-muted"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`active` is the whole state axis: the label shimmers while the thing is still happening, and settles to flat text once it is done. Colour is inherited, so the same line reads correctly wherever it is dropped."
      >
        <SpecimenRow label="active">
          <ChatStatusLine
            label="Checking your inbox"
            active
            className="text-ink-muted"
          />
        </SpecimenRow>
        <SpecimenRow label="settled">
          <ChatStatusLine
            label="Checked your inbox"
            className="text-ink-muted"
          />
        </SpecimenRow>
        <SpecimenRow label="Inherited colour">
          <span className="text-ink">
            <ChatStatusLine label="Waiting for you to connect Gmail" active />
          </span>
        </SpecimenRow>
        <SpecimenRow label="Truncates rather than wraps">
          <div className="w-56">
            <ChatStatusLine
              label="Looking through everything Inbox Zero can reach on your behalf"
              className="text-ink-muted"
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`iconSize` tunes the glyph to the type it sits beside; the label itself is fixed at the 12px meta size the log uses throughout."
      >
        <SpecimenRow label="iconSize 13 (default)">
          <ChatStatusLine label="Mission log" className="text-ink-muted" />
        </SpecimenRow>
        <SpecimenRow label="iconSize 20">
          <ChatStatusLine
            label="Mission log"
            iconSize={20}
            className="text-ink-muted"
          />
        </SpecimenRow>
        <SpecimenRow label="Shimmer on its own">
          <Shimmer duration={1.5}>Processing your receipts</Shimmer>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "label",
            type: "string",
            note: "ChatStatusLine. Already-translated status text. Required.",
          },
          {
            name: "active",
            type: "boolean",
            note: "ChatStatusLine. Shimmers the label to mean still-in-progress. Leave off for a settled status.",
          },
          {
            name: "icon",
            type: "ReactNode",
            note: "ChatStatusLine. Leading glyph. Defaults to the Houston helmet at `iconSize`.",
          },
          {
            name: "iconSize",
            type: "number",
            note: "ChatStatusLine. Helmet size in px. Defaults to 13, the Mission log size.",
          },
          {
            name: "className",
            type: "string",
            note: "ChatStatusLine. Extra classes on the root span. Text colour is INHERITED, so this is where the caller sets it.",
          },
          {
            name: "children",
            type: "string",
            note: "Shimmer. The text to sweep. A string, not nodes: the sweep is a background clipped to glyphs.",
          },
          {
            name: "as",
            type: "ElementType",
            note: "Shimmer. The element to render. Defaults to `p`; the status line passes text through inline elements instead.",
          },
          {
            name: "duration",
            type: "number",
            note: "Shimmer. Seconds per sweep. Defaults to 2; the status line uses 1.",
          },
          {
            name: "spread",
            type: "number",
            note: "Shimmer. Width of the highlight, scaled by the text length. Defaults to 2.",
          },
        ]}
      />

      {/* The shimmer sweep is a gradient, not a utility: it reads the two
          tokens by name inside an arbitrary `--bg` property, so they are
          listed as tokens rather than as classes. */}
      <SpecimenTokens
        classes={["text-ink", "text-ink-muted", "--ht-input", "--ht-ink-muted"]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = ["ChatStatusLine", "Shimmer"];

export const specimen: Specimen = {
  id: "chat-status-line",
  title: "ChatStatusLine",
  group: "Chat",
  render: () => <ChatStatusLineSpecimen />,
};
