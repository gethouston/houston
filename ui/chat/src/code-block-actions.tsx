"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { copyTextToClipboard } from "./clipboard";

const COPY_RESET_MS = 1600;

const BUTTON_CLASS =
  "inline-flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-chip-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function CodeBlockActions({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={BUTTON_CLASS}
      onClick={() => {
        void copyTextToClipboard(code).then(() => setCopied(true));
      }}
      title="Copy code"
      aria-label="Copy code"
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  );
}
