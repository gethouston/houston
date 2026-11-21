"use client";

import { type FormEvent, useState } from "react";

export interface BrowserLiveAddressProps {
  url: string;
  disabled: boolean;
  refused: boolean;
  label: string;
  refusedLabel: string;
  onNavigate: (url: string) => void;
}

export function addressTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

export function BrowserLiveAddress({
  url,
  disabled,
  refused,
  label,
  refusedLabel,
  onNavigate,
}: BrowserLiveAddressProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const target = addressTarget(draft ?? "");
    if (!target) return;
    onNavigate(target);
    setDraft(null);
    const field = e.currentTarget.elements.namedItem("address");
    if (field instanceof HTMLInputElement) field.blur();
  };
  return (
    <form className="min-w-0 flex-1" onSubmit={submit}>
      <input
        aria-describedby={refused ? "browser-live-address-refused" : undefined}
        aria-invalid={refused || undefined}
        aria-label={label}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="h-10 w-full min-w-0 rounded-full border border-line-input bg-input px-4 text-base text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger-ring"
        disabled={disabled}
        enterKeyHint="go"
        inputMode="url"
        name="address"
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(e.target.value);
          e.target.select();
        }}
        spellCheck={false}
        value={draft ?? url}
      />
      {refused ? (
        <p
          className="mt-1 px-4 text-xs text-danger-ink"
          id="browser-live-address-refused"
          role="alert"
        >
          {refusedLabel}
        </p>
      ) : null}
    </form>
  );
}
