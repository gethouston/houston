import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DictationModelProgress,
  DictationModelStatus,
} from "../dictation/types";
import { invokeNative } from "./invoke.ts";

export function osTranscribeAudio(
  wav: Uint8Array,
  langHint: string,
): Promise<string> {
  return invokeNative<string>("transcribe_audio", wav, {
    headers: { "x-dictation-lang": langHint },
  });
}

export function osDictationModelStatus(): Promise<DictationModelStatus> {
  return invokeNative<DictationModelStatus>("dictation_model_status");
}

export function osDownloadDictationModel(): Promise<void> {
  return invokeNative<void>("download_dictation_model");
}

export function onDictationModelProgress(
  handler: (progress: DictationModelProgress) => void,
): Promise<UnlistenFn> {
  return listen<DictationModelProgress>("dictation-model-progress", (ev) =>
    handler(ev.payload),
  );
}
