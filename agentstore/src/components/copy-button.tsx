"use client";

import { Button } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import * as React from "react";

type ButtonProps = React.ComponentProps<typeof Button>;

export interface CopyButtonProps
  extends Omit<ButtonProps, "onClick" | "children"> {
  /** The text placed on the clipboard. */
  value: string;
  /** Label shown in the idle state. */
  label: React.ReactNode;
  /** Label shown for ~2s after a successful copy. */
  copiedLabel?: React.ReactNode;
  /** Accessible name for the control (defaults to the idle label if a string). */
  "aria-label"?: string;
}

/**
 * A copy-to-clipboard button that reflects success inline and announces it to
 * assistive tech. Falls back to a hidden textarea + execCommand where the async
 * clipboard API is unavailable; copy failures never throw (the surrounding UI
 * always offers another path to the same content).
 */
export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  className,
  variant,
  size,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    const ok = await writeClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleCopy}
      aria-live="polite"
      {...rest}
    >
      {copied ? (
        <Check aria-hidden className="size-4" />
      ) : (
        <Copy aria-hidden className="size-4" />
      )}
      {copied ? copiedLabel : label}
    </Button>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
