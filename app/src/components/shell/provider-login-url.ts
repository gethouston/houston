import { codexUsesLoopbackRelay } from "../../lib/engine-mode.ts";

export function providerLoginUrlHost(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.hostname.replace(/^www\./, "");
}

export function shouldOpenLoginUrlDirectly(opts: {
  isDesktop: boolean;
  userCode: string | null | undefined;
  authCode?: boolean;
}): boolean {
  return opts.isDesktop && !opts.userCode && !opts.authCode;
}

export function shouldUseCodexLoopback(opts: {
  provider: string;
  env: { VITE_NEW_ENGINE_URL?: string; VITE_HOSTED_ENGINE_URL?: string };
  isTauri: boolean;
  userCode: string | null | undefined;
}): boolean {
  return (
    opts.provider === "openai" &&
    codexUsesLoopbackRelay(opts.env, { isTauri: opts.isTauri }) &&
    !opts.userCode
  );
}

export function shouldUseClaudeDesktopLogin(opts: {
  provider: string;
  isTauri: boolean;
}): boolean {
  return opts.provider === "anthropic" && opts.isTauri;
}
