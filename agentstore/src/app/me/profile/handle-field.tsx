"use client";

import { StoreApiError } from "@houston/agentstore-client";
import {
  HANDLE_REGEX,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@houston/agentstore-contract";
import { Input } from "@houston-ai/core";
import { Check, Loader2, X } from "lucide-react";
import * as React from "react";
import { checkHandle } from "@/lib/store-client";

/** Local availability status, before/after the gateway round-trip. */
type Status =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "reserved" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" };

const HINT: Record<
  Status["kind"],
  { text: string; tone: "ok" | "bad" | "mute" }
> = {
  idle: {
    text: "2 to 30 characters: lowercase letters, numbers, underscore.",
    tone: "mute",
  },
  invalid: {
    text: "Use 2 to 30 lowercase letters, numbers, or underscores.",
    tone: "bad",
  },
  reserved: { text: "That handle is reserved.", tone: "bad" },
  checking: { text: "Checking availability…", tone: "mute" },
  available: { text: "Handle is available.", tone: "ok" },
  taken: { text: "That handle is already taken.", tone: "bad" },
};

export interface HandleFieldProps {
  value: string;
  onChange: (value: string) => void;
  getToken: () => Promise<string | null>;
  /** The profile's current handle, always treated as available for the owner. */
  currentHandle: string | null;
}

/**
 * The `@handle` input with live availability feedback. Grammar and the reserved
 * list are decided locally for instant response; uniqueness is confirmed by the
 * gateway (`checkHandle`) after a short debounce. The gateway stays the sole
 * authority — this only guides the user before they save.
 */
export function HandleField({
  value,
  onChange,
  getToken,
  currentHandle,
}: HandleFieldProps) {
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const normalized = normalizeHandle(value);

  React.useEffect(() => {
    if (!normalized) return setStatus({ kind: "idle" });
    if (normalized === currentHandle) return setStatus({ kind: "available" });
    if (!HANDLE_REGEX.test(normalized)) return setStatus({ kind: "invalid" });
    if (RESERVED_HANDLES.has(normalized))
      return setStatus({ kind: "reserved" });

    let cancelled = false;
    setStatus({ kind: "checking" });
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Session expired.");
        const result = await checkHandle(token, normalized);
        if (cancelled) return;
        if (result.available) return setStatus({ kind: "available" });
        setStatus({
          kind:
            result.reason === "invalid"
              ? "invalid"
              : (result.reason ?? "taken"),
        });
      } catch (err) {
        if (cancelled) return;
        // A failed check is advisory only; fall back to a neutral hint rather
        // than blocking the save the gateway will re-validate anyway.
        if (err instanceof StoreApiError && err.status === 409) {
          setStatus({ kind: "taken" });
        } else {
          setStatus({ kind: "idle" });
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, currentHandle, getToken]);

  const hint = HINT[status.kind];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="profile-handle" className="text-sm font-medium">
        Handle
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
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
          placeholder="yourname"
          className="pr-9 pl-7"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2">
          {status.kind === "checking" && (
            <Loader2
              aria-hidden
              className="size-4 animate-spin text-muted-foreground"
            />
          )}
          {status.kind === "available" && (
            <Check aria-hidden className="size-4 text-success" />
          )}
          {(status.kind === "taken" ||
            status.kind === "reserved" ||
            status.kind === "invalid") && (
            <X aria-hidden className="size-4 text-destructive" />
          )}
        </span>
      </div>
      <p
        className={
          hint.tone === "ok"
            ? "text-xs text-success"
            : hint.tone === "bad"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
        }
      >
        {hint.text}
      </p>
    </div>
  );
}
