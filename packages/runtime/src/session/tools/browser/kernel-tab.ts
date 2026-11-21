import type { Browser } from "playwright-core";
import { backupState } from "./backup-state";
import {
  createKernelSession,
  deleteKernelSession,
  type Kernel,
  KernelError,
  kernelCode,
  kernelFrom,
} from "./kernel";
import { DESKTOP_VIEWPORT } from "./live/layout";
import { type BrowserTab, wireTab } from "./open-tab";
import { readState } from "./state-store";

export interface BackupBrowser {
  open(statePath: string, maxPages: number, host: string): Promise<BrowserTab>;
}

export type ConnectOverCdp = (url: string) => Promise<Browser>;

const connectOverCdp: ConnectOverCdp = async (url) => {
  const { chromium } = await import("playwright-core");
  return chromium.connectOverCDP(url);
};

export function kernelBackup(
  kernel: Kernel,
  connect: ConnectOverCdp = connectOverCdp,
): BackupBrowser {
  return {
    open: (statePath, maxPages, host) =>
      openKernelTab(kernel, statePath, maxPages, host, connect),
  };
}

export function backupFromEnv(
  env: Record<string, string | undefined>,
): () => BackupBrowser | null {
  let resolved: BackupBrowser | null | undefined;
  return () => {
    if (resolved === undefined) {
      const kernel = kernelFrom(env);
      resolved = kernel ? kernelBackup(kernel) : null;
    }
    return resolved;
  };
}

export async function openKernelTab(
  kernel: Kernel,
  statePath: string,
  maxPages: number,
  host: string,
  connect: ConnectOverCdp,
): Promise<BrowserTab> {
  const session = await createKernelSession(kernel);
  let released: Promise<void> | null = null;
  const release = () => {
    released ??= deleteKernelSession(kernel, session.id).catch(
      (error: unknown) =>
        console.error(
          "[browser] ending a Kernel session failed",
          kernelCode(error),
        ),
    );
    return released;
  };
  let browser: Browser | undefined;
  try {
    browser = await connect(session.connectUrl).catch(() => {
      throw new KernelError("connect_failed");
    });
    browser.once("disconnected", () => void release());
    const context = browser.contexts()[0];
    if (!context) throw new KernelError("no_default_context");
    const stored = await readState(statePath);
    const saved = stored ? backupState(stored, host) : undefined;
    if (saved) await context.setStorageState(saved);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const tab = await wireTab(context, page, statePath, saved, maxPages);
    tab.scope = (state) => backupState(state, host);
    tab.base = tab.scope(tab.base);
    const owned = browser;
    tab.backup = {
      host,
      dispose: async () => {
        try {
          await owned.close();
        } finally {
          await release();
        }
      },
    };
    return tab;
  } catch (error) {
    await browser?.close().catch((closing: unknown) => {
      console.error("[browser] closing a half-open Kernel browser failed", {
        name: closing instanceof Error ? closing.name : "unknown",
      });
    });
    await release();
    throw error;
  }
}
