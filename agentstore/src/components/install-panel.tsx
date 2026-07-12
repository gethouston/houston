"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@houston-ai/core";
import { Download, FileText, Rocket } from "lucide-react";
import { CopyButton } from "./copy-button";

/** Where a visitor without the app goes to get it. */
const HOUSTON_DOWNLOAD_URL = "https://gethouston.ai";

export interface InstallPanelProps {
  agentName: string;
  /** Pre-built, server-rendered copy-paste install instructions. */
  instructions: string;
  /** Absolute URL to the Claude Skill .zip (target=claude-skill-zip). */
  skillZipUrl: string;
  /** Absolute URL to the universal copy-paste markdown (target=copy-paste). */
  copyPasteUrl: string;
  /** Public share link for this agent (its /a/<slug> page). */
  shareUrl: string;
}

/**
 * The install surface on the agent detail page. Action ladder:
 *   1. PRIMARY  copy install instructions for the visitor's own AI assistant.
 *   2. Download the Claude Skill .zip.
 *   3. Download the universal copy-paste markdown.
 *   4. Open in Houston, a dialog with the share link + the three steps.
 *
 * The instructions text is composed on the server and passed in, so this stays a
 * thin interaction shell.
 */
export function InstallPanel({
  agentName,
  instructions,
  skillZipUrl,
  copyPasteUrl,
  shareUrl,
}: InstallPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-base font-semibold">
          Install {agentName}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Hand it to your AI assistant, or download it for Claude.
        </p>
      </div>

      <CopyButton
        value={instructions}
        label="Copy install instructions"
        copiedLabel="Copied to clipboard"
        size="lg"
        className="w-full"
        aria-label={`Copy install instructions for ${agentName}`}
      />
      <p className="-mt-1 text-xs text-muted-foreground">
        Paste it into Claude, ChatGPT, Gemini, or any assistant. It fetches and
        sets up this agent for you.
      </p>

      <Button asChild variant="outline" size="lg" className="w-full">
        <a href={skillZipUrl} download>
          <Download aria-hidden className="size-4" />
          Download Claude Skill (.zip)
        </a>
      </Button>

      <Button asChild variant="outline" size="lg" className="w-full">
        <a href={copyPasteUrl} download>
          <FileText aria-hidden className="size-4" />
          Download as Markdown
        </a>
      </Button>

      <OpenInHoustonDialog agentName={agentName} shareUrl={shareUrl} />
    </div>
  );
}

function OpenInHoustonDialog({
  agentName,
  shareUrl,
}: {
  agentName: string;
  shareUrl: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full">
          <Rocket aria-hidden className="size-4" />
          Open in Houston
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open {agentName} in Houston</DialogTitle>
          <DialogDescription>
            Houston is the free desktop app for running agents like this one.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-3 text-sm">
          <Step n={1}>
            Open Houston on your computer. Do not have it yet? Download it
            below.
          </Step>
          <Step n={2}>Go to Add agent, then choose Install from a link.</Step>
          <Step n={3}>Paste the link below and follow the steps.</Step>
        </ol>

        <CopyButton
          value={shareUrl}
          label="Copy share link"
          copiedLabel="Copied to clipboard"
          size="lg"
          className="w-full"
          aria-label={`Copy the share link for ${agentName}`}
        />

        <Button asChild variant="outline" size="lg" className="w-full">
          <a href={HOUSTON_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            <Download aria-hidden className="size-4" />
            Download Houston
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
