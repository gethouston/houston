import type { SpecimenProp } from "../../../src/specimen";

/**
 * The message family's API, read off `ui/chat/src/ai-elements/message.tsx`.
 * Every row names the component it belongs to, because the family is one
 * bubble assembled from five pieces rather than five separate components.
 */
export const messageProps: readonly SpecimenProp[] = [
  {
    name: "from",
    type: 'UIMessage["role"]',
    note: "Message. Who spoke. `user` right-aligns the filled bubble, anything else renders as plain assistant prose.",
  },
  {
    name: "peer",
    type: "boolean",
    note: "Message. The turn was written by SOMEONE ELSE: alignment follows the writer, not the role, and the bubble mirrors left as a hairlined `is-peer` chip.",
  },
  {
    name: "avatar",
    type: "React.ReactNode",
    note: "Message. Badge pinned to the bubble's outer bottom corner — the channel a turn arrived through. Read by MessageContent through context.",
  },
  {
    name: "children",
    type: "React.ReactNode",
    note: "MessageContent. The bubble body. It owns the fill, radius and padding for all three variants.",
  },
  {
    name: "children",
    type: "string",
    note: "MessageResponse. The markdown of an assistant turn, streamed through Streamdown.",
  },
  {
    name: "onOpenLink",
    type: "(url: string) => void",
    note: "MessageResponse. Opens a link the agent wrote. Every link — bare URL or labeled — renders as the same inline chip; without this handler they degrade to inert text rather than a chip that does nothing.",
  },
  {
    name: "renderLink",
    type: "RenderLinkFn",
    note: "MessageResponse. Replaces the default renderer for every `<a>`; returning undefined falls back, so an app can claim only the URLs it recognises.",
  },
  {
    name: "mentions",
    type: "readonly MentionTarget[]",
    note: "MessageResponse. Teammates whose surviving `@Name` runs become chips. Absent leaves the markdown pipeline untouched.",
  },
  {
    name: "tooltip",
    type: "string",
    note: "MessageAction. Wraps the button in a tooltip and doubles as its screen-reader label when `label` is absent.",
  },
  {
    name: "label",
    type: "string",
    note: "MessageAction. Visually-hidden name for an icon-only button.",
  },
  {
    name: "source",
    type: "ChannelSource",
    note: "ChannelAvatar. `telegram` and `slack` paint their brand badge; anything else falls back to a plain chip disc.",
  },
  {
    name: "size",
    type: '"sm" | "md"',
    note: "ChannelAvatar. 24px or 32px. Defaults to `sm`, the size a bubble badge wears.",
  },
];

/** Every token utility the family paints with, read off its source. */
export const messageTokens: readonly string[] = [
  "bg-ink",
  "text-input",
  "dark:bg-chip-subtle",
  "dark:text-ink",
  "bg-chip",
  "bg-chip-subtle",
  "border-line",
  "text-ink",
  "text-ink-muted",
  "text-action",
];
