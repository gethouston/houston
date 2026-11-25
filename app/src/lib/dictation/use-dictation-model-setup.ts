import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast, showExpectedStateToast } from "../error-toast";
import { osDictationModelStatus } from "../os-bridge";
import { downloadDictationModel } from "./model-download";
import {
  DICTATION_MODEL_FALLBACK_MB,
  dictationErrorText as errorText,
  dictationSizeMb as toMb,
} from "./types";

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
  ensureReady: () => Promise<void>;
  reopen: () => Promise<void>;
  reset: () => void;
}

export function useDictationModelSetup(
  onReady: () => void,
): UseDictationModelSetupResult {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [sizeMb, setSizeMb] = useState(DICTATION_MODEL_FALLBACK_MB);

  const reopen = useCallback(async () => {
    try {
      setSizeMb(toMb((await osDictationModelStatus()).sizeBytes));
    } catch {}
    setOpen(true);
  }, []);

  const ensureReady = useCallback(async () => {
    try {
      const status = await osDictationModelStatus();
      if (!status.cpuSupported) {
        showExpectedStateToast(
          t("composer.dictation.unsupportedTitle"),
          t("composer.dictation.unsupportedBody"),
        );
        return;
      }
      if (status.ready) {
        onReady();
        return;
      }
      setSizeMb(toMb(status.sizeBytes));
      setOpen(true);
    } catch (err) {
      showErrorToast("dictation_model_status", errorText(err), err);
    }
  }, [onReady, t]);

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
