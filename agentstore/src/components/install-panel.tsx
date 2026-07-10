"use client";

import { Button } from "@houston-ai/core";
import { Download, FileText, Rocket } from "lucide-react";
import { CopyButton } from "./copy-button";

export interface InstallPanelProps {
  agentName: string;
  /** Pre-built, server-rendered copy-paste install instructions. */
  instructions: string;
  /** Absolute URL to the Claude Skill .zip (target=claude-skill-zip). */
  skillZipUrl: string;
  /** Absolute URL to the universal copy-paste markdown (target=copy-paste). */
  copyPasteUrl: string;
}

/**
 * The install surface on the agent detail page. Action ladder:
 *   1. PRIMARY — copy install instructions for the visitor's own AI assistant.
 *   2. Download the Claude Skill .zip.
 *   3. Download the universal copy-paste markdown.
 *   4. DISABLED "Open in Houston" (coming soon).
 *
 * The instructions text is composed on the server and passed in, so this stays a
 * thin interaction shell.
 */
export function InstallPanel({
  agentName,
  instructions,
  skillZipUrl,
  copyPasteUrl,
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
        Paste it into Claude, ChatGPT, Gemini, or any assistant — it fetches and
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

      <Button
        variant="outline"
        size="lg"
        disabled
        aria-disabled="true"
        className="w-full"
      >
        <Rocket aria-hidden className="size-4" />
        Open in Houston
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          Coming soon
        </span>
      </Button>
    </div>
  );
}
