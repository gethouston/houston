"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Separator,
  Spinner,
} from "@houston-ai/core";
import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { normalizeCreatorUrl } from "@/lib/agents/creator-url";
import { shareUrlForSlug } from "@/lib/site-config";
import {
  type AgentSummary,
  listMyAgents,
  patchAgent,
  StoreApiError,
} from "@/lib/store-client";

/** Friendly message for a publish failure, keyed on the gateway error code. */
function publishError(err: unknown): string {
  if (err instanceof StoreApiError) {
    // The identity PATCH only sets the creator name and link, so the gateway's
    // generic `invalid_input` here means one of those two fields was rejected.
    if (err.code === "invalid_input") {
      return "Please check your creator name and link, then try again.";
    }
    if (err.status === 429) return "Too many attempts. Please wait a minute.";
    return err.message;
  }
  return "Publishing failed. Please try again.";
}

export interface ClaimManageProps {
  /** Mints a fresh bearer per operation (tokens expire between renders). */
  getToken: () => Promise<string | null>;
  agent: AgentSummary;
  onPublished: (shareUrl: string) => void;
}

/**
 * The post-claim publish step: the new owner confirms their creator name (and an
 * optional link), then publishes. Publishing is two PATCHes — set the identity
 * creator, then finalize with `{publish:true}` — after which the freshly minted
 * slug is read back from `me/agents` to build the share URL.
 */
export function ClaimManage({
  getToken,
  agent,
  onPublished,
}: ClaimManageProps) {
  const seed = agent.creator.displayName;
  const [displayName, setDisplayName] = React.useState(
    seed && seed !== "Unclaimed" ? seed : "",
  );
  const [creatorUrl, setCreatorUrl] = React.useState(agent.creator.url ?? "");
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function publish() {
    const name = displayName.trim();
    if (!name) return;
    const link = normalizeCreatorUrl(creatorUrl);
    if (!link.ok) {
      setUrlError(link.error);
      return;
    }
    setUrlError(null);
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      await patchAgent(token, agent.id, {
        identity: {
          creator: {
            displayName: name,
            ...(link.url ? { url: link.url } : {}),
          },
        },
      });
      await patchAgent(token, agent.id, { publish: true });
      const mine = await listMyAgents(token);
      const published = mine.find((a) => a.id === agent.id);
      if (!published?.slug) {
        throw new Error("The agent published but no link came back.");
      }
      onPublished(shareUrlForSlug(published.slug));
    } catch (err) {
      setError(publishError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Publish {agent.name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          This agent is now yours. Add your creator name, then publish to get a
          shareable link.
        </p>
      </header>

      {agent.tagline && (
        <p className="rounded-lg border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          {agent.tagline}
        </p>
      )}

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="creator-name" className="text-sm font-medium">
            Creator name
          </label>
          <Input
            id="creator-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="creator-url" className="text-sm font-medium">
            Link <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="creator-url"
            type="url"
            inputMode="url"
            value={creatorUrl}
            onChange={(e) => {
              setCreatorUrl(e.target.value);
              if (urlError) setUrlError(null);
            }}
            placeholder="your-site.com"
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? "creator-url-error" : undefined}
          />
          {urlError && (
            <p
              id="creator-url-error"
              className="text-sm font-medium text-destructive"
            >
              {urlError}
            </p>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden />
            <AlertTitle>Could not publish</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          size="lg"
          onClick={publish}
          disabled={busy || !displayName.trim()}
        >
          {busy && <Spinner />}
          {busy ? "Publishing…" : "Publish agent"}
        </Button>
      </section>
    </div>
  );
}
