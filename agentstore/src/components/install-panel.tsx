"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, Download, Globe, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  buildStoreInstallDeepLink,
  buildWebAppInstallUrl,
} from "@/lib/houston-launch";
import { CopyButton } from "./copy-button";

const HOUSTON_DOWNLOAD_URL = "https://gethouston.ai/#download";

const LAUNCH_FALLBACK_MS = 1500;

export interface InstallPanelProps {
  agentName: string;
  slug: string;
  instructions: string;
}

export function InstallPanel({
  agentName,
  slug,
  instructions,
}: InstallPanelProps) {
  return (
    <OpenInHouston
      agentName={agentName}
      slug={slug}
      instructions={instructions}
    />
  );
}

function OpenInHouston({
  agentName,
  slug,
  instructions,
}: {
  agentName: string;
  slug: string;
  instructions: string;
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

    cleanupRef.current?.();

    let launched = false;
    const markLaunched = () => {
      launched = true;
    };
    window.addEventListener("blur", markLaunched, { once: true });
    document.addEventListener("visibilitychange", markLaunched, { once: true });

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
    <div className="flex flex-col items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="lg" className="w-full rounded-full px-7 sm:w-auto">
            Try it now
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72">
          <DropdownMenuItem onSelect={openInHouston}>
            <Rocket aria-hidden className="size-4" />
            Open in Houston
          </DropdownMenuItem>
          <div className="p-1">
            <CopyButton
              value={instructions}
              label="Copy instructions for your coding agent"
              copiedLabel="Copied to clipboard"
              variant="ghost"
              className="w-full justify-start"
              aria-label={`Copy install instructions for ${agentName}`}
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <iframe ref={iframeRef} title="Open in Houston" className="hidden" />

      {showFallback && (
        <div className="flex w-full flex-col gap-2 rounded-xl bg-chip-subtle p-3 sm:w-72">
          <p className="text-sm text-ink-muted">Do not have Houston yet?</p>
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
    </div>
  );
}
