"use client";

import { Alert, AlertDescription, AlertTitle } from "@houston-ai/core";
import { AlertTriangle, ExternalLink, PartyPopper } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

/** A destructive notice used for the missing/unconfigured/error claim states. */
export function ClaimNotice({ title, body }: { title: string; body: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

/** The published-and-live confirmation with the shareable public link. */
export function ClaimSuccess({ shareUrl }: { shareUrl: string }) {
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
    </div>
  );
}
