"use client";

import type { AgentIR } from "@houston/agentstore-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Separator,
  Spinner,
} from "@houston-ai/core";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  PartyPopper,
} from "lucide-react";
import * as React from "react";
import { CopyButton } from "@/components/copy-button";
import { SkillList } from "@/components/skill-list";
import {
  normalizeCreatorUrl,
  publishErrorMessage,
} from "@/lib/agents/creator-url";
import { siteConfig } from "@/lib/site-config";

interface AgentSummary {
  id: string;
  slug: string | null;
  name: string;
  state: "draft" | "published" | "archived";
  visibility: "unlisted" | "public";
}
interface MeResponse {
  agent: AgentSummary;
  ir: AgentIR;
}
interface PatchResponse {
  agent: AgentSummary;
  shareUrl?: string;
}

type ViewState =
  | { status: "loading" }
  | {
      status: "error";
      kind: "missing" | "invalid" | "network";
      message?: string;
    }
  | { status: "ready"; agent: AgentSummary; ir: AgentIR }
  | { status: "published"; shareUrl: string; ir: AgentIR }
  | { status: "success"; shareUrl: string };

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const value = new URLSearchParams(hash).get("t");
  return value?.trim() ? value.trim() : null;
}

function shareUrlFor(slug: string | null): string {
  const base = siteConfig.url.replace(/\/$/, "");
  return slug ? `${base}/a/${slug}` : base;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Best-effort read of the `error` code from a failed JSON response body. A
 *  non-JSON body is a normal, expected case (not an error to surface); the
 *  caller always shows a message regardless of what this returns. */
async function readErrorCode(res: Response): Promise<string | undefined> {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

export function ClaimClient() {
  const [state, setState] = React.useState<ViewState>({ status: "loading" });
  const [displayName, setDisplayName] = React.useState("");
  const [creatorUrl, setCreatorUrl] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const tokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const token = readToken();
    if (!token) {
      setState({ status: "error", kind: "missing" });
      return;
    }
    tokenRef.current = token;

    (async () => {
      try {
        const res = await fetch("/api/agents/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.status === 401) {
          setState({ status: "error", kind: "invalid" });
          return;
        }
        if (!res.ok)
          throw new Error(`We could not load your agent (${res.status}).`);
        const data = (await res.json()) as MeResponse;
        if (data.agent.state === "published") {
          setState({
            status: "published",
            shareUrl: shareUrlFor(data.agent.slug),
            ir: data.ir,
          });
          return;
        }
        const seed = data.ir.identity.creator.displayName;
        setDisplayName(seed && seed !== "Unclaimed" ? seed : "");
        setCreatorUrl(data.ir.identity.creator.url ?? "");
        setState({ status: "ready", agent: data.agent, ir: data.ir });
      } catch (err) {
        setState({ status: "error", kind: "network", message: errorText(err) });
      }
    })();
  }, []);

  async function handlePublish() {
    if (state.status !== "ready" || !tokenRef.current) return;
    const name = displayName.trim();
    if (!name) return;

    const link = normalizeCreatorUrl(creatorUrl);
    if (!link.ok) {
      setUrlError(link.error);
      return;
    }
    setUrlError(null);
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/agents/${state.agent.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          creator: {
            displayName: name,
            ...(link.url ? { url: link.url } : {}),
          },
          publish: true,
        }),
      });
      if (!res.ok) {
        const code = await readErrorCode(res);
        // The link is the only user-editable field the server can reject as
        // invalid; route that back to the field instead of the generic alert.
        if (code === "invalid_creator") {
          setUrlError("Enter a valid link that starts with https://");
          return;
        }
        throw new Error(publishErrorMessage(code, res.status));
      }
      const data = (await res.json()) as PatchResponse;
      setState({
        status: "success",
        shareUrl: data.shareUrl ?? shareUrlFor(data.agent.slug),
      });
    } catch (err) {
      setPublishError(errorText(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      {state.status === "loading" && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Spinner />
          Loading your agent…
        </div>
      )}

      {state.status === "error" && <ClaimError state={state} />}

      {state.status === "published" && (
        <PublishedNotice
          name={state.ir.identity.name}
          shareUrl={state.shareUrl}
        />
      )}

      {state.status === "success" && (
        <SuccessNotice shareUrl={state.shareUrl} token={tokenRef.current} />
      )}

      {state.status === "ready" && (
        <div className="flex flex-col gap-8">
          <header>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Publish {state.ir.identity.name}
            </h1>
            <p className="mt-2 text-muted-foreground">
              You are about to make this agent public. Add your creator name,
              then publish to get a shareable link.
            </p>
          </header>

          {state.ir.instructions.trim() && (
            <section>
              <h2 className="mb-2 font-display text-sm font-semibold text-muted-foreground">
                Instructions preview
              </h2>
              <pre className="max-h-40 overflow-auto rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                {state.ir.instructions.slice(0, 600)}
                {state.ir.instructions.length > 600 ? "…" : ""}
              </pre>
            </section>
          )}

          {state.ir.skills.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
                {state.ir.skills.length}{" "}
                {state.ir.skills.length === 1 ? "skill" : "skills"}
              </h2>
              <SkillList skills={state.ir.skills} />
            </section>
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

            {publishError && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden />
                <AlertTitle>Could not publish</AlertTitle>
                <AlertDescription>{publishError}</AlertDescription>
              </Alert>
            )}

            <Button
              size="lg"
              onClick={handlePublish}
              disabled={publishing || !displayName.trim()}
            >
              {publishing && <Spinner />}
              {publishing ? "Publishing…" : "Publish agent"}
            </Button>
          </section>
        </div>
      )}
    </main>
  );
}

function ClaimError({
  state,
}: {
  state: Extract<ViewState, { status: "error" }>;
}) {
  const copy: Record<typeof state.kind, { title: string; body: string }> = {
    missing: {
      title: "No claim link found",
      body: "Open the claim link exactly as it was given to you — it carries a private token in the part after #.",
    },
    invalid: {
      title: "This claim link is not valid",
      body: "The token is missing, expired, or already used. Check that you copied the full link, including everything after #.",
    },
    network: {
      title: "Something went wrong",
      body: state.message ?? "Please try opening your claim link again.",
    },
  };
  const { title, body } = copy[state.kind];
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

function PublishedNotice({
  name,
  shareUrl,
}: {
  name: string;
  shareUrl: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <CheckCircle2 aria-hidden />
        <AlertTitle>{name} is already published</AlertTitle>
        <AlertDescription>Its public page is ready to share.</AlertDescription>
      </Alert>
      <ShareRow shareUrl={shareUrl} />
    </div>
  );
}

function SuccessNotice({
  shareUrl,
  token,
}: {
  shareUrl: string;
  token: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <PartyPopper aria-hidden className="size-7" />
        </span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          You&apos;re live
        </h1>
        <p className="text-muted-foreground">
          Your agent is published. Share the link below with anyone.
        </p>
      </div>

      <ShareRow shareUrl={shareUrl} />

      {token && (
        <Alert>
          <KeyRound aria-hidden />
          <AlertTitle>Save your manage token</AlertTitle>
          <AlertDescription>
            <p>
              This token is the only way to edit or unpublish your agent. Store
              it somewhere safe — we cannot recover it for you.
            </p>
            <div className="mt-2 flex w-full items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {token}
              </code>
              <CopyButton
                value={token}
                label="Copy"
                size="sm"
                variant="outline"
                aria-label="Copy manage token"
              />
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ShareRow({ shareUrl }: { shareUrl: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
      <span className="text-sm font-medium text-muted-foreground">
        Public link
      </span>
      <div className="flex items-center gap-2">
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-primary underline underline-offset-4"
        >
          {shareUrl}
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
        </a>
        <CopyButton
          value={shareUrl}
          label="Copy link"
          size="sm"
          variant="outline"
          aria-label="Copy public link"
        />
      </div>
    </div>
  );
}
