import { IdentityError } from "./errors.ts";

export const CALLBACK_TIMEOUT_MS = 300_000;

export const BROWSER_OPEN_TIMEOUT_MS = 15_000;

export function browserOpenTimeout(stage: string): IdentityError {
  return new IdentityError("browser_open_timeout", { rawCode: stage });
}

export interface BrowserOpenDeadlineOptions<T> {
  ms?: number;
  releaseIfLate?: (value: T) => void;
}

export function withBrowserOpenDeadline<T>(
  work: Promise<T>,
  stage: string,
  opts: BrowserOpenDeadlineOptions<T> = {},
): Promise<T> {
  let abandoned = false;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abandoned = true;
      reject(browserOpenTimeout(stage));
    }, opts.ms ?? BROWSER_OPEN_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        if (abandoned) opts.releaseIfLate?.(value);
        else resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export type UnlistenFn = () => void;

export type DeepLinkListen = (
  onPayload: (payload: string) => void,
) => Promise<UnlistenFn>;

export interface AwaitCallbackParams {
  expectedState: string;
  authorizeUrl: string;
  listen: DeepLinkListen;
  openUrl: (url: string) => Promise<unknown>;
  onBrowserOpened?: () => void;
  abandonLoopback?: () => void;
  parsePayload?: (payload: string, expectedState: string) => string;
  timeoutMs?: number;
  browserOpenTimeoutMs?: number;
}
