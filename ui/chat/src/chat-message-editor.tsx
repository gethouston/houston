"use client";

import { Button } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";

/**
 * The in-place editor an "Edit message" action swaps a user bubble for
 * (PRODUCT-1217): the message's text in a full-width card with Cancel / Send,
 * ChatGPT's edit grammar. Send REWINDS the conversation to this message and
 * continues from the edited text — the consumer owns that behavior; this
 * component only edits. Enter sends (Shift+Enter breaks a line), Escape
 * cancels, and Send disables while empty or while the submit is in flight so
 * a double-tap cannot rewind twice.
 */
export function ChatMessageEditor({
  initialText,
  onSubmit,
  onCancel,
  labels,
}: {
  initialText: string;
  onSubmit: (text: string) => void | Promise<void>;
  onCancel: () => void;
  labels?: { send?: string; cancel?: string; editor?: string };
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Open ready to type: focused, caret at the end, sized to the content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Bordered + filled so the editing state is unmistakable against the
    // panel in both themes: the field border tells you it is an input, the
    // input fill steps it off the canvas (in dark, #1e1e1e over the glass).
    <div className="w-full rounded-[28px] border border-line-input bg-input px-4 py-3">
      <textarea
        aria-label={labels?.editor ?? "Edit message"}
        className="max-h-64 w-full resize-none bg-transparent text-base leading-6 text-ink outline-none placeholder:text-ink-muted"
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        ref={ref}
        rows={1}
        value={text}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          className="rounded-full"
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          {labels?.cancel ?? "Cancel"}
        </Button>
        <Button
          className="rounded-full"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
          size="sm"
          type="button"
        >
          {labels?.send ?? "Send"}
        </Button>
      </div>
    </div>
  );
}
