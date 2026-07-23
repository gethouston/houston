"use client";

import { StoreApiError } from "@houston/agentstore-client";
import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Spinner,
} from "@houston-ai/core";
import * as React from "react";
import { grantCreatorHandle } from "@/lib/store-admin-client";

/** Feedback after a grant attempt: success line, or a failure with its code. */
type Result = { tone: "ok" | "bad"; message: string } | null;

/** A human line for a known gateway error code, always tagged with the code. */
function grantErrorMessage(err: unknown): string {
  if (err instanceof StoreApiError) {
    const code = err.code ?? `http_${err.status}`;
    const detail =
      err.code === "invalid_handle"
        ? "That handle is not valid."
        : err.code === "display_name_required"
          ? "A display name is required to materialize this profile."
          : err.code === "user_not_found"
            ? "No user exists with that id."
            : err.code === "handle_taken"
              ? "That handle is already taken."
              : err.message;
    return `${detail} (${code})`;
  }
  return err instanceof Error ? err.message : "That action failed. Try again.";
}

/**
 * Grant a creator handle to a specific user id. Reserved handles are allowed
 * here (this is how official handles like @houston are minted), so only the
 * grammar is checked client-side; the gateway remains the authority. On success
 * the parent lookup is refreshed to the granted handle so the manage controls
 * target it immediately.
 */
export function GrantHandleForm({
  getToken,
  onGranted,
}: {
  getToken: () => Promise<string | null>;
  onGranted: (handle: string) => void;
}) {
  const [handle, setHandle] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);

  async function submit() {
    const clean = normalizeHandle(handle);
    if (!HANDLE_REGEX.test(clean)) {
      setResult({ tone: "bad", message: "Enter a valid handle." });
      return;
    }
    const uid = userId.trim();
    if (!uid) {
      setResult({ tone: "bad", message: "Enter a user id." });
      return;
    }
    const name = displayName.trim();
    setBusy(true);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      const profile = await grantCreatorHandle(token, clean, {
        userId: uid,
        ...(name ? { displayName: name } : {}),
      });
      setResult({
        tone: "ok",
        message: `@${clean} now belongs to ${profile.displayName}.`,
      });
      onGranted(clean);
    } catch (err) {
      setResult({ tone: "bad", message: grantErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-display text-base font-semibold">Grant a handle</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign a handle to a user id. Reserved handles are allowed, so this
          mints official handles like @houston.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-40">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
            @
          </span>
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="handle"
            className="pl-7"
          />
        </div>
        <Input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="user id"
          className="flex-1"
        />
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="display name (new profiles)"
          className="flex-1"
        />
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy && <Spinner className="size-4" />}
          Grant
        </Button>
      </div>
      {result && (
        <Alert variant={result.tone === "bad" ? "destructive" : "default"}>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
