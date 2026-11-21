"use client";

import { Button } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";

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
