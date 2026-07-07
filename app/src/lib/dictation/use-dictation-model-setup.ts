/**
 * Model-download consent state for dictation: whether the pinned whisper
 * model needs downloading, its download progress, and the confirm/dismiss
 * actions `DictationSetupDialog` drives. Split out of `use-dictation.ts` so
 * that hook stays focused on the capture/transcribe state machine.
 *
 * Deliberately outside `dictation-reducer.ts`'s phase machine: per contract
 * `DictationControl.state` stays "idle" while this dialog is open — nothing
 * is being captured yet.
 */
import { useCallback, useMemo, useState } from "react";
import { showErrorToast } from "../error-toast";
import { osDictationModelStatus } from "../os-bridge";
import { downloadDictationModel } from "./model-download";
import {
  dictationErrorText as errorText,
  dictationSizeMb as toMb,
} from "./types";

/** Matches `MODEL_SIZE_BYTES` in `app/src-tauri/src/dictation/model.rs`;
 *  used only as a size-hint fallback if a status probe fails. */
const DEFAULT_MODEL_SIZE_MB = 181;

export interface DictationModelSetup {
  open: boolean;
  downloading: boolean;
  progressPct: number;
  sizeMb: number;
  confirm: () => void;
  dismiss: () => void;
}

export interface UseDictationModelSetupResult {
  modelSetup: DictationModelSetup;
  /** Probe status: ready -> call `onReady()`; not ready -> open the dialog
   *  with a fresh size hint. Surfaces a probe failure itself (toast). */
  ensureReady: () => Promise<void>;
  /** Re-probe + reopen after a downstream "model-not-ready" failure (the
   *  model vanished after an earlier ready check). Best-effort size fetch —
   *  the dialog opens either way. */
  reopen: () => Promise<void>;
  /** Force-close, e.g. on disable/unmount. */
  reset: () => void;
}

export function useDictationModelSetup(
  onReady: () => void,
): UseDictationModelSetupResult {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [sizeMb, setSizeMb] = useState(DEFAULT_MODEL_SIZE_MB);

  const reopen = useCallback(async () => {
    try {
      setSizeMb(toMb((await osDictationModelStatus()).sizeBytes));
    } catch {
      /* keep the last-known size hint */
    }
    setOpen(true);
  }, []);

  const ensureReady = useCallback(async () => {
    try {
      const status = await osDictationModelStatus();
      if (status.ready) {
        onReady();
        return;
      }
      setSizeMb(toMb(status.sizeBytes));
      setOpen(true);
    } catch (err) {
      showErrorToast("dictation_model_status", errorText(err), err);
    }
  }, [onReady]);

  const confirm = useCallback(async () => {
    setDownloading(true);
    setProgressPct(0);
    try {
      await downloadDictationModel(setProgressPct);
      setOpen(false);
      setDownloading(false);
      onReady();
    } catch (err) {
      setDownloading(false);
      showErrorToast("dictation_download_model", errorText(err), err);
    }
  }, [onReady]);

  const dismiss = useCallback(() => setOpen(false), []);
  const reset = useCallback(() => {
    setOpen(false);
    setDownloading(false);
  }, []);

  const modelSetup: DictationModelSetup = useMemo(
    () => ({
      open,
      downloading,
      progressPct,
      sizeMb,
      confirm: () => void confirm(),
      dismiss,
    }),
    [open, downloading, progressPct, sizeMb, confirm, dismiss],
  );

  return { modelSetup, ensureReady, reopen, reset };
}
