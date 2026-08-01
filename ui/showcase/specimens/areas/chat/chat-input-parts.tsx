import {
  ChatInput,
  type ChatInputProps,
  type MentionPerson,
} from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";

/** The teammates the composer offers after an "@". */
export const MENTION_PEOPLE: readonly MentionPerson[] = [
  { userId: "u-julian", name: "julian" },
  { userId: "u-felipe", name: "Felipe" },
  { userId: "u-mara", name: "Mara" },
];

/**
 * A real, sending composer.
 *
 * The specimen never fakes a send with an alert: the composer keeps its own
 * text, the send resolves, and the last message it accepted is echoed under
 * the box — which is exactly how a caller sees `onSend` behave.
 */
export function LiveComposer(props: Omit<ChatInputProps, "onSend">) {
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div className="w-full max-w-lg">
      <ChatInput
        {...props}
        onSend={(text, files) => {
          const names = files.map((file) => file.name).join(", ");
          setSent(names.length > 0 ? `${text} (${names})` : text);
        }}
      />
      <p className={cn(storeType.meta, "px-4")}>
        {sent === null ? "Nothing sent yet." : `Sent: ${sent}`}
      </p>
    </div>
  );
}

/** A frozen composer — the states that only make sense mid-turn. */
export function StaticComposer(props: ChatInputProps) {
  return (
    <div className="w-full max-w-lg">
      <ChatInput {...props} />
    </div>
  );
}

/** `ChatInputProps`, read off `ui/chat/src/chat-input-types.ts`. */
export const chatInputProps: readonly SpecimenProp[] = [
  {
    name: "onSend",
    type: "(text, files, mentions) => void | Promise<void>",
    note: "Required. Text and files are always passed; `mentions` are the pending @mentions whose text survived into the sent message.",
  },
  {
    name: "value / onValueChange",
    type: "string / (value: string) => void",
    note: "Controlled text. Omit both to let the composer keep its own; controlled mode makes the parent responsible for clearing after a send.",
  },
  {
    name: "attachments / onAttachmentsChange",
    type: "File[] / (files: File[]) => void",
    note: "Controlled attachments, same contract as the text pair.",
  },
  {
    name: "status",
    type: '"ready" | "streaming" | "submitted"',
    note: "Defaults to `ready`. Anything else swaps the send control for stop and lets Escape call `onStop`.",
  },
  {
    name: "onStop",
    type: "() => void",
    note: "Interrupts the running turn. Wired to the stop control and to Escape.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "Locks the whole composer inert and dims it, for while an interaction owns the turn.",
  },
  {
    name: "canSendEmpty",
    type: "boolean",
    note: "Allows a submit with no text and no files. Off by default.",
  },
  {
    name: "placeholder",
    type: "string",
    note: 'Defaults to "Type a message...". Already translated: `ui/` stays language-agnostic.',
  },
  {
    name: "header / footer",
    type: "ReactNode",
    note: "Slots inside the box above the textarea, and under it (the model selector lives in the footer).",
  },
  {
    name: "attachMenu",
    type: "ReactNode | ((api) => ReactNode)",
    note: "Popover anchored to the paperclip. The render-prop form receives `openFilePicker`, `openFolderPicker` and `close`.",
  },
  {
    name: "queuedMessages",
    type: "QueuedChatMessage[]",
    note: "Messages accepted while a turn is running, listed above the box until they go as one turn.",
  },
  {
    name: "onRemoveQueuedMessage",
    type: "(id: string) => void",
    note: "Drops one queued message. Omit and the queued rows carry no remove control.",
  },
  {
    name: "mentionPeople",
    type: "readonly MentionPerson[]",
    note: 'Teammates the "@" popover offers. Empty or absent means it never opens and "@" types plainly.',
  },
  {
    name: "dictation",
    type: "DictationControl",
    note: "Prop-driven mic. Omit to hide the affordance entirely (the web build has no capture).",
  },
  {
    name: "prepareAttachments",
    type: "PrepareAttachments",
    note: "Lets the app rewrite or reject dropped files before they reach the composer.",
  },
  {
    name: "onNotice",
    type: "(message: string) => void",
    note: "A short notice the library wants surfaced (a duplicate file drop). The app decides how to show it.",
  },
  {
    name: "draftKey",
    type: "string",
    note: "The conversation this draft belongs to, so switching missions never sends one chat's @mention picks with another's words.",
  },
];
