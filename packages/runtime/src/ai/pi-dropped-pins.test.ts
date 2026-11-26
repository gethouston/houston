import { canonicalModelId } from "@houston/domain";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { expect, test } from "vitest";
import { retryNvidiaFallbacks } from "../auth/nvidia-verify";
import { ApiKeyVerifyError } from "../auth/verify-errors";
import { piModelIds } from "./pi-catalog";
import {
  classifyProviderError,
  type ModelNotOfferedError,
} from "./provider-error";
import { safeGetModel, safeModelIds } from "./providers";

/**
 * Stored pins on rows pi 1.6.0 (NVIDIA, Qwen Token Plan) and 1.6.1 (Copilot,
 * Mistral, Google, Groq) dropped. The OpenCode gateways' drops live in
 * ./opencode-catalog.test.ts.
 */

test("a stored pin on a dropped row with a successor runs on it", () => {
  for (const [provider, stale, successor] of [
    // The old NVIDIA default, so it is what most stored NVIDIA pins hold.
    ["nvidia", "openai/gpt-oss-20b", "minimaxai/minimax-m3.1-flash"],
    ["qwen-token-plan", "deepseek-v4-flash", "deepseek-v4-flash-0731"],
    ["qwen-token-plan-cn", "deepseek-v4-flash", "deepseek-v4-flash-0731"],
    // The curated Copilot Terra row, and the retired ids that pointed at it.
    ["github-copilot", "gpt-5.6-terra", "gpt-6.1-terra"],
    ["github-copilot", "gpt-5.5", "gpt-6.1-terra"],
    ["github-copilot", "claude-opus-5", "claude-opus-5.5"],
    ["mistral", "mistral-large-4-0-8", "mistral-large-4"],
    ["mistral", "mistral-medium-3.5", "mistral-medium-2604"],
    ["mistral", "open-mistral-nemo", "ministral-8b-latest"],
    ["mistral", "pixtral-12b", "ministral-8b-latest"],
    ["google", "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-lite"],
    ["groq", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
  ] as const) {
    expect(piModelIds(provider), stale).not.toContain(stale);
    const pinned = canonicalModelId(provider, stale);
    expect(pinned, stale).toBe(successor);
    const model = safeGetModel(provider, pinned ?? "", true) as {
      id?: string;
      provider?: string;
    };
    expect(model.id, stale).toBe(successor);
    expect(model.provider, stale).toBe(provider);
  }
});

test("a stored pin on a dropped row with no successor gets a runnable switch target", () => {
  for (const [provider, stale] of [
    ["nvidia", "moonshotai/kimi-k2.6"],
    ["nvidia", "deepseek-ai/deepseek-v4.1-flash"],
    ["qwen-token-plan", "deepseek-v3.2"],
    // Retired by Mistral; Medium 3.5 costs 3.75x more.
    ["mistral", "devstral-medium-latest"],
    // Small 4 costs 2x more per output token.
    ["mistral", "mistral-small-2506"],
    // Free previews; no free Mistral row is left.
    ["mistral", "labs-devstral-small-2512"],
    ["mistral", "labs-leanstral-1-5-1"],
    // Groq's old first row; every Groq row left costs more.
    ["groq", "llama-3.1-8b-instant"],
  ] as const) {
    expect(canonicalModelId(provider, stale), stale).toBe(stale);
    let thrown: unknown;
    try {
      safeGetModel(provider, stale, true);
    } catch (err) {
      thrown = err;
    }
    const { providerError } = thrown as ModelNotOfferedError;
    expect(providerError.kind, stale).toBe("model_unavailable");
    const fallback =
      providerError.kind === "model_unavailable"
        ? providerError.suggested_fallback
        : null;
    expect(safeModelIds(provider), stale).toContain(fallback);
  }
});

test("Groq's default is its cheapest row pi still lists", () => {
  expect(piModelIds("groq")).toContain(DEFAULT_MODEL.groq);
  expect(DEFAULT_MODEL.groq).toBe("openai/gpt-oss-20b");
});

test("every NVIDIA model Houston falls back to is in pi's NVIDIA catalog", () => {
  const nvidia = piModelIds("nvidia");
  expect(nvidia).toContain(DEFAULT_MODEL.nvidia);
  const gated = classifyProviderError({
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
    message: "404 status code (no body)",
  });
  expect(gated.kind).toBe("model_unavailable");
  if (gated.kind === "model_unavailable")
    expect(nvidia).toContain(gated.suggested_fallback);
});

test("the NVIDIA key check probes every fallback, none lost to catalog drift", async () => {
  // A fallback pi no longer lists is skipped silently, so a stale id would
  // quietly shrink the check to fewer model families than it claims.
  const probed: string[] = [];
  const failure = await retryNvidiaFallbacks(
    "nvidia",
    "google/gemma-3-12b-it",
    "404 status code (no body)",
    async (model) => {
      probed.push(model.id);
      return "404 status code (no body)";
    },
  ).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(ApiKeyVerifyError);
  expect(probed).toEqual([
    "minimaxai/minimax-m3.1-flash",
    "nvidia/nemotron-3.5-super-vl-120b-a12b",
  ]);
  for (const id of probed) expect(piModelIds("nvidia")).toContain(id);
});
