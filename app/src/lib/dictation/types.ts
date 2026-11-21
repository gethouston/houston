import { normalizeLocale } from "../locale";

export {
  type DictationSidecarFailure,
  dictationErrorExtra,
  dictationErrorText,
  isDictationSidecarFailure,
} from "./sidecar-failure";

export interface DictationModelStatus {
  ready: boolean;
  modelId: string;
  sizeBytes: number;
  cpuSupported: boolean;
}

export const DICTATION_UNSUPPORTED_CPU = "dictation-unsupported-cpu";

export interface DictationModelProgress {
  received: number;
  total: number;
  phase: "downloading" | "verifying" | "done" | "error";
}

export type DictationLangHint = "en" | "es" | "pt" | "auto";

export function resolveDictationLangHint(
  resolvedLanguage: string | undefined,
): DictationLangHint {
  return normalizeLocale(resolvedLanguage) ?? "auto";
}

export function dictationSizeMb(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / 1_000_000));
}
