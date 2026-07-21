"use client";

import { StoreApiError } from "@houston/agentstore-client";
import { normalizeHandle } from "@houston/agentstore-contract";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Spinner,
} from "@houston-ai/core";
import * as React from "react";
import {
  releaseCreatorHandle,
  setCreatorVerified,
} from "@/lib/store-admin-client";
import { CreatorReportsTab } from "./creator-reports-tab";

type Action = "verify" | "unverify" | "release";

/** Result feedback after a management action; success or a failure reason. */
type Result = { tone: "ok" | "bad"; message: string } | null;

function resultMessage(action: Action, handle: string): string {
  if (action === "verify") return `@${handle} is now verified.`;
  if (action === "unverify")
    return `Removed the verified badge from @${handle}.`;
  return `Released @${handle}. The handle is now free to claim.`;
}

/**
 * The creator moderation panel: look up a creator by handle to grant or remove
 * the verified badge or release the handle, and review creator abuse reports.
 * Access is gated by the gateway (404 for non-admins), surfaced by the actions.
 */
export function CreatorsTab({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const [handle, setHandle] = React.useState("");
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [result, setResult] = React.useState<Result>(null);

  async function run(action: Action) {
    const clean = normalizeHandle(handle);
    if (!clean) {
      setResult({ tone: "bad", message: "Enter a handle first." });
      return;
    }
    if (action === "release" && !window.confirm(`Release @${clean}?`)) return;
    setBusy(action);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      if (action === "release") await releaseCreatorHandle(token, clean);
      else await setCreatorVerified(token, clean, action === "verify");
      setResult({ tone: "ok", message: resultMessage(action, clean) });
    } catch (err) {
      setResult({
        tone: "bad",
        message:
          err instanceof StoreApiError && err.status === 404
            ? `No creator with the handle @${clean}.`
            : err instanceof Error
              ? err.message
              : "That action failed. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-display text-base font-semibold">
            Manage a creator
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Look up a creator by handle to verify, unverify, or release it.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
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
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => run("verify")}
            >
              {busy === "verify" && <Spinner className="size-4" />}
              Verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("unverify")}
            >
              {busy === "unverify" && <Spinner className="size-4" />}
              Unverify
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => run("release")}
            >
              {busy === "release" && <Spinner className="size-4" />}
              Release
            </Button>
          </div>
        </div>
        {result && (
          <Alert variant={result.tone === "bad" ? "destructive" : "default"}>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-base font-semibold">
          Creator reports
        </h2>
        <CreatorReportsTab getToken={getToken} />
      </section>
    </div>
  );
}
