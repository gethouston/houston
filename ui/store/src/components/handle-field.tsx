"use client";

import {
  HANDLE_REGEX,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@houston/agentstore-contract";
import { Input } from "@houston-ai/core";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

type Status =
  | "idle"
  | "invalid"
  | "reserved"
  | "checking"
  | "available"
  | "taken";

export interface HandleAvailability {
  available: boolean;
  reason?: "taken" | "reserved" | "invalid";
}

export interface HandleFieldLabels {
  label: string;
  placeholder: string;
  idle: string;
  invalid: string;
  reserved: string;
  checking: string;
  available: string;
  taken: string;
}

export const HANDLE_FIELD_LABELS: HandleFieldLabels = {
  label: "Handle",
  placeholder: "yourname",
  idle: "2 to 30 characters: lowercase letters, numbers, underscore.",
  invalid: "Use 2 to 30 lowercase letters, numbers, or underscores.",
  reserved: "That handle is reserved.",
  checking: "Checking availability…",
  available: "Handle is available.",
  taken: "That handle is already taken.",
};

const TONE: Record<Status, "ok" | "bad" | "mute"> = {
  idle: "mute",
  invalid: "bad",
  reserved: "bad",
  checking: "mute",
  available: "ok",
  taken: "bad",
};

export interface HandleFieldProps {
  value: string;
  onChange: (value: string) => void;
  checkHandle: (handle: string) => Promise<HandleAvailability>;
  currentHandle: string | null;
  labels?: Partial<HandleFieldLabels>;
}

export function HandleField({
  value,
  onChange,
  checkHandle,
  currentHandle,
  labels: overrides,
}: HandleFieldProps) {
  const labels = { ...HANDLE_FIELD_LABELS, ...overrides };
  const [status, setStatus] = useState<Status>("idle");
  const normalized = normalizeHandle(value);

  useEffect(() => {
    if (!normalized) return setStatus("idle");
    if (normalized === currentHandle) return setStatus("available");
    if (!HANDLE_REGEX.test(normalized)) return setStatus("invalid");
    if (RESERVED_HANDLES.has(normalized)) return setStatus("reserved");

    let cancelled = false;
    setStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const result = await checkHandle(normalized);
        if (cancelled) return;
        if (result.available) return setStatus("available");
        setStatus(result.reason ?? "taken");
      } catch {
        if (!cancelled) setStatus("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, currentHandle, checkHandle]);

  const tone = TONE[status];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="profile-handle" className="font-medium text-sm">
        {labels.label}
      </label>
      <div className="relative">
        <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-ink-muted">
          @
        </span>
        <Input
          id="profile-handle"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          placeholder={labels.placeholder}
          className="pr-9 pl-7"
        />
        <span className="-translate-y-1/2 absolute top-1/2 right-3">
          {status === "checking" && (
            <Loader2
              aria-hidden
              className="size-4 animate-spin text-ink-muted"
            />
          )}
          {status === "available" && (
            <Check aria-hidden className="size-4 text-success" />
          )}
          {(status === "taken" ||
            status === "reserved" ||
            status === "invalid") && (
            <X aria-hidden className="size-4 text-danger" />
          )}
        </span>
      </div>
      <p
        className={
          tone === "ok"
            ? "text-success text-xs"
            : tone === "bad"
              ? "text-danger text-xs"
              : "text-ink-muted text-xs"
        }
      >
        {labels[status]}
      </p>
    </div>
  );
}
