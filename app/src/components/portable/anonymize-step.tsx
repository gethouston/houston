/**
 * Step 2 of the portable share flow: optionally let Houston anonymize the
 * picked content, reviewing every change side by side before it leaves.
 */

import {
  Button,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import type { PortableAnonymizeResponse } from "@houston-ai/engine-client";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AnonymizeAccept } from "../../lib/portable-share";
import { AnonymizeReviewList } from "./anonymize-review-list";
import { ChoiceCard, Subtle } from "./wizard-parts";

export function AnonymizeStep({
  wantAnonymize,
  onChoose,
  useAi,
  onToggleAi,
  onStart,
  anonymizing,
  progress,
  slow,
  stopped,
  onStop,
  anonymized,
  accept,
  setAccept,
}: {
  wantAnonymize: boolean | null;
  onChoose: (v: boolean) => void;
  useAi: boolean;
  onToggleAi: (v: boolean) => void;
  onStart: () => void;
  anonymizing: boolean;
  progress: { done: number; total: number } | null;
  slow: boolean;
  stopped: boolean;
  onStop: () => void;
  anonymized: PortableAnonymizeResponse | null;
  accept: AnonymizeAccept;
  setAccept: (a: AnonymizeAccept) => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("export.step2.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("export.step2.body")}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChoiceCard
          selected={wantAnonymize === false}
          onClick={() => onChoose(false)}
          title={t("export.step2.asIsTitle")}
          body={t("export.step2.asIsBody")}
        />
        <ChoiceCard
          selected={wantAnonymize === true}
          onClick={() => onChoose(true)}
          title={t("export.step2.anonymizeTitle")}
          body={t("export.step2.anonymizeBody")}
        />
      </div>

      {wantAnonymize && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 py-1">
            <p className="text-sm text-foreground">
              {t("export.step2.aiToggleTitle")}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("export.step2.aiToggleHint")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                {t("export.step2.aiToggleHint")}
              </TooltipContent>
            </Tooltip>
            <Switch
              checked={useAi}
              onCheckedChange={onToggleAi}
              disabled={anonymizing}
              className="ml-auto shrink-0"
            />
          </div>

          {!anonymizing && (
            <Button
              size="sm"
              variant={anonymized ? "outline" : "default"}
              className="rounded-full"
              onClick={onStart}
            >
              {anonymized
                ? t("export.step2.checkAgain")
                : t("export.step2.startReview")}
            </Button>
          )}

          {(anonymizing || anonymized) && (
            <h2 className="text-sm font-medium">
              {t("export.step2.reviewLabel")}
            </h2>
          )}
          {anonymizing && (
            <div className="space-y-3">
              <div className="running-glow-line bg-foreground/5" aria-hidden />
              <Subtle>
                {progress && progress.total > 1
                  ? t("export.step2.workingProgress", {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t("export.step2.working")}
              </Subtle>
              {slow && !stopped && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("export.step2.slowNotice")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full"
                    onClick={onStop}
                  >
                    {t("export.step2.stopWait")}
                  </Button>
                </div>
              )}
              {stopped && <Subtle>{t("export.step2.stopping")}</Subtle>}
            </div>
          )}
          {!anonymizing && anonymized?.aiError && (
            <p className="text-xs text-muted-foreground rounded-lg bg-secondary p-3">
              {t("export.step2.aiFallback", { reason: anonymized.aiError })}
            </p>
          )}
          {anonymized && (
            <AnonymizeReviewList
              anonymized={anonymized}
              accept={accept}
              setAccept={setAccept}
            />
          )}
        </section>
      )}
    </div>
  );
}
