"use client";

import { Button } from "@houston-ai/core";
import { Download, FileText, Globe, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  buildStoreInstallDeepLink,
  buildWebAppInstallUrl,
} from "@/lib/houston-launch";
import { CopyButton } from "./copy-button";

/** Where a visitor without the app goes to get it. */
const HOUSTON_DOWNLOAD_URL = "https://gethouston.ai/#download";

/** How long we wait for Houston to take focus before offering a fallback. */
const LAUNCH_FALLBACK_MS = 1500;

export interface InstallPanelProps {
  agentName: string;
  /** Agent Store slug, used to build the "Open in Houston" deep link. */
  slug: string;
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
 *   4. Open in Houston, a one-click deep link that seeds the desktop import
 *      wizard, with a non-destructive fallback for visitors without the app.
 *
 * The instructions text is composed on the server and passed in, so this stays a
 * thin interaction shell.
 */
export function InstallPanel({
  agentName,
  slug,
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

      <OpenInHouston agentName={agentName} slug={slug} shareUrl={shareUrl} />
    </div>
  );
}

function OpenInHouston({
  agentName,
  slug,
  shareUrl,
}: {
  agentName: string;
  slug: string;
  shareUrl: string;
}) {
  const [showFallback, setShowFallback] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  function openInHouston() {
    const deepLink = buildStoreInstallDeepLink(slug);
    if (!deepLink) return;

    // A repeat click supersedes the previous attempt entirely.
    cleanupRef.current?.();

    // If Houston opens, the browser tab loses focus or is hidden. Track that so
    // a user who already has the app never sees the "don't have it?" fallback.
    let launched = false;
    const markLaunched = () => {
      launched = true;
    };
    window.addEventListener("blur", markLaunched, { once: true });
    document.addEventListener("visibilitychange", markLaunched, { once: true });

    // A hidden iframe navigates to the custom scheme without a top-level
    // "unknown protocol" error page when Houston is not installed.
    if (iframeRef.current) iframeRef.current.src = deepLink;

    const timer = window.setTimeout(() => {
      cleanupRef.current?.();
      if (!launched && document.visibilityState === "visible") {
        setShowFallback(true);
      }
    }, LAUNCH_FALLBACK_MS);

    cleanupRef.current = () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", markLaunched);
      document.removeEventListener("visibilitychange", markLaunched);
      cleanupRef.current = null;
    };
  }

  const webUrl = buildWebAppInstallUrl(slug);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={openInHouston}
      >
        <Rocket aria-hidden className="size-4" />
        Open in Houston
      </Button>
      <iframe ref={iframeRef} title="Open in Houston" className="hidden" />

      {showFallback && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm text-muted-foreground">
            Do not have Houston yet?
          </p>
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={HOUSTON_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              <Download aria-hidden className="size-4" />
              Download Houston
            </a>
          </Button>
          {webUrl && (
            <Button asChild variant="outline" size="lg" className="w-full">
              <a href={webUrl}>
                <Globe aria-hidden className="size-4" />
                Open in Houston Web
              </a>
            </Button>
          )}
        </div>
      )}

      <CopyButton
        value={shareUrl}
        label="Copy share link"
        copiedLabel="Copied to clipboard"
        variant="ghost"
        className="w-full"
        aria-label={`Copy the share link for ${agentName}`}
      />
    </div>
  );
}
