/**
 * One-time consent dialog for the dictation model download (~181 MB,
 * whisper.cpp `ggml-small-q5_1`). Shown by `useDictation` the first time the
 * user hits the mic and the model isn't on disk yet; download progress
 * streams in via `onDictationModelProgress` (`use-dictation.ts` owns the
 * subscription, this component just renders the resulting numbers).
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { DictationModelSetup } from "../lib/dictation/use-dictation";

export function DictationSetupDialog({
  modelSetup,
}: {
  modelSetup: DictationModelSetup;
}) {
  const { t } = useTranslation("chat");

  return (
    <Dialog
      open={modelSetup.open}
      onOpenChange={(next) => {
        if (!next) modelSetup.dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("composer.dictation.setupTitle")}</DialogTitle>
          <DialogDescription>
            {t("composer.dictation.setupBody", {
              sizeMb: modelSetup.sizeMb,
            })}
          </DialogDescription>
        </DialogHeader>
        {modelSetup.downloading && (
          <div className="flex flex-col gap-2">
            <Progress value={modelSetup.progressPct} />
            <p className="text-xs text-muted-foreground">
              {t("composer.dictation.setupProgress", {
                pct: modelSetup.progressPct,
              })}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={modelSetup.dismiss}
            disabled={modelSetup.downloading}
          >
            {t("composer.dictation.cancel")}
          </Button>
          <Button
            onClick={modelSetup.confirm}
            disabled={modelSetup.downloading}
          >
            {t("composer.dictation.setupConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
