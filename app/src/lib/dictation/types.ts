/**
 * Wire shapes the Rust shell's three dictation commands speak
 * (`app/src-tauri/src/dictation/`), plus small pure helpers used by the
 * composer wiring. Kept dependency-free (bar `../locale`) so it loads under
 * the bare Node test runner.
 */

import { normalizeLocale } from "../locale";

/** Mirrors `DictationModelStatus` in `app/src-tauri/src/dictation/types.rs`
 *  (`dictation_model_status`'s return shape). */
export interface DictationModelStatus {
  ready: boolean;
  modelId: string;
  sizeBytes: number;
}

/** A single progress tick on the `dictation-model-progress` event, mirroring
 *  `ModelProgress` in the Rust shell (`download_dictation_model`). */
export interface DictationModelProgress {
  received: number;
  total: number;
  phase: "downloading" | "verifying" | "done" | "error";
}

/** The `x-dictation-lang` header value `transcribe_audio` accepts. */
export type DictationLangHint = "en" | "es" | "pt" | "auto";

/** Maps the app's resolved UI language to whisper's language hint;
 *  unsupported/unresolved locales fall through to "auto" (whisper
 *  autodetects rather than mis-transcribing under a wrong forced language). */
export function resolveDictationLangHint(
  resolvedLanguage: string | undefined,
): DictationLangHint {
  return normalizeLocale(resolvedLanguage) ?? "auto";
}

/** Tauri rejects with either a raw string (Rust's `Err(String)`, e.g. the
 *  sentinel `"model-not-ready"`) or an `Error`; normalize to plain text. */
export function dictationErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Bytes -> whole MB, floored at 1 so a tiny/zero size never reads as "0 MB". */
export function dictationSizeMb(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / 1_000_000));
}
