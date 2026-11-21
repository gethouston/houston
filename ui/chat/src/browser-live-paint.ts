"use client";

import { type RefObject, useEffect, useState } from "react";
import type {
  BrowserLiveFrames,
  BrowserLiveViewFrame,
} from "./browser-live-types";

function jpegBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

export function useBrowserLivePaint(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  frames: BrowserLiveFrames,
  onPaintError?: (error: unknown) => void,
): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let lastSeq = Number.NEGATIVE_INFINITY;
    let busy = false;
    let pending: BrowserLiveViewFrame | null = null;
    let disposed = false;

    async function paint(frame: BrowserLiveViewFrame): Promise<void> {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || typeof createImageBitmap !== "function") return;
      const bitmap = await createImageBitmap(jpegBlob(frame.jpeg));
      try {
        if (disposed) return;
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        setPainted(true);
      } finally {
        bitmap.close();
      }
    }

    async function offer(frame: BrowserLiveViewFrame): Promise<void> {
      if (frame.seq <= lastSeq) return;
      if (busy) {
        pending = frame;
        return;
      }
      busy = true;
      lastSeq = frame.seq;
      try {
        await paint(frame);
      } catch (error) {
        onPaintError?.(error);
      } finally {
        busy = false;
      }
      const next = pending;
      pending = null;
      if (next && !disposed) void offer(next);
    }

    const latest = frames.latest();
    if (latest) void offer(latest);
    const unsubscribe = frames.subscribe((frame) => {
      void offer(frame);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [canvasRef, frames, onPaintError]);

  return painted;
}
