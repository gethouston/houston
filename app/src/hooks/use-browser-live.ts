import type {
  BrowserLiveConnection,
  BrowserLiveConnectOptions,
} from "@houston/engine-adapter";
import {
  type BrowserLiveViewInput,
  type BrowserLiveViewState,
  isBrowserLiveViewEnded,
} from "@houston-ai/chat";
import { useIsMobile } from "@houston-ai/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserLive } from "../lib/browser-live-facade";
import {
  browserLiveViewState,
  createBrowserLiveFrames,
} from "../lib/browser-live-view-state";
import { logAndReportError } from "../lib/error-report";

export interface BrowserLiveSession {
  state: BrowserLiveViewState;
  url: string;
  title: string;
  expiresAt: number;
  addressRefused: boolean;
  frames: ReturnType<typeof createBrowserLiveFrames>;
  onInput: (events: BrowserLiveViewInput[]) => void;
  onDone: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onPaintError: (error: unknown) => void;
}

export function useBrowserLive({
  agentPath,
  conversationId,
  open,
  onFinished,
}: {
  agentPath: string;
  conversationId: string;
  open: boolean;
  onFinished: () => void;
}): BrowserLiveSession {
  const layout: NonNullable<BrowserLiveConnectOptions["layout"]> = useIsMobile()
    ? "phone"
    : "desktop";
  const [frames] = useState(createBrowserLiveFrames);
  const [state, setState] = useState<BrowserLiveViewState>("connecting");
  const [page, setPage] = useState({ url: "", title: "" });
  const [expiresAt, setExpiresAt] = useState(0);
  const [addressRefused, setAddressRefused] = useState(false);
  const connection = useRef<BrowserLiveConnection | null>(null);
  const paintReported = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const layoutRef = useRef(layout);
  useEffect(() => {
    onFinishedRef.current = onFinished;
    layoutRef.current = layout;
  });

  useEffect(() => {
    if (!open) return;
    setState("connecting");
    setAddressRefused(false);
    paintReported.current = false;
    try {
      connection.current = browserLive.open(
        agentPath,
        conversationId,
        {
          onFrame: (frame) => frames.push(frame),
          onPage: (next) => {
            setPage(next);
            setAddressRefused(false);
          },
          onStatus: (status) => setExpiresAt(status.expiresAt),
          onConnection: (next) => setState(browserLiveViewState(next)),
          onRefused: () => setAddressRefused(true),
          onUnexpected: (error) => logAndReportError("browser_live", error),
        },
        { layout: layoutRef.current },
      );
    } catch (error) {
      logAndReportError("browser_live_open", error);
      setState("lost");
    }
    return () => {
      connection.current?.close();
      connection.current = null;
    };
  }, [open, agentPath, conversationId, frames]);

  useEffect(() => {
    connection.current?.setLayout(layout);
  }, [layout]);

  const onInput = useCallback((events: BrowserLiveViewInput[]) => {
    for (const event of events) {
      if (event.type === "navigate") setAddressRefused(false);
      connection.current?.send(event);
    }
  }, []);

  const finish = useCallback((outcome: "done" | "cancel") => {
    const live = connection.current;
    if (!live) return;
    live
      .finish(outcome)
      .then((result) => {
        if (result === "answered") onFinishedRef.current();
      })
      .catch((error: unknown) =>
        logAndReportError(`browser_live_finish_${outcome}`, error),
      );
  }, []);

  const onDone = useCallback(() => finish("done"), [finish]);
  const onCancel = useCallback(() => finish("cancel"), [finish]);
  const onRetry = useCallback(() => connection.current?.retry(), []);
  const onPaintError = useCallback((error: unknown) => {
    if (paintReported.current) return;
    paintReported.current = true;
    logAndReportError("browser_live_paint", error);
  }, []);

  return {
    state,
    url: page.url,
    title: page.title,
    expiresAt: isBrowserLiveViewEnded(state) ? 0 : expiresAt,
    addressRefused,
    frames,
    onInput,
    onDone,
    onCancel,
    onRetry,
    onPaintError,
  };
}
