/**
 * Step 1 of "From a friend": open the shared `.houstonagent` file, then decide
 * whether Houston reads it for risks before anything is installed.
 *
 * The scan choice is a two-card answer rather than a checkbox because it is
 * the one security decision in the flow, and both answers are legitimate. It
 * stays a local card (not the flow's `FlowChoiceRow`) because the pick must
 * keep reading as CHOSEN afterwards — the flow's Continue is gated on it.
 *
 * Renders bare, in the compact frame: what the step is called is the sheet's
 * own title, so the screen opens on the line that explains it. The scan cards
 * stack rather than pairing up — two of them side by side inside a hand-sized
 * dialog leave neither enough room to read.
 */

import type {
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "@houston/engine-adapter";
import { Button, cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function ImportUploadStep({
  uploaded,
  wantScan,
  onChooseScan,
  onPick,
  scanning,
  scan,
}: {
  uploaded: PortableUploadPreviewResponse | null;
  wantScan: boolean | null;
  onChooseScan: (yes: boolean) => void;
  onPick: () => void;
  scanning: boolean;
  scan: PortableScanResponse | null;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">{t("import.step1.body")}</p>

      {!uploaded ? (
        <Button onClick={onPick}>{t("import.step1.pickFile")}</Button>
      ) : (
        <section className="space-y-2 text-sm">
          <p className="text-ink">{uploaded.manifest.agentName}</p>
          <p className="text-ink-muted">
            {t("import.step1.uploadedFrom", {
              name: uploaded.manifest.exporter ?? t("import.step1.anonymous"),
            })}
          </p>
          <p className="text-ink-muted tabular-nums">
            {t("import.step1.counts", {
              skills: uploaded.preview.skills.length,
              routines: uploaded.preview.routines.length,
              learnings: uploaded.preview.learnings.length,
            })}
          </p>
          {uploaded.manifest.anonymized && (
            <p className="text-ink-muted">{t("import.step1.anonymizedFlag")}</p>
          )}
        </section>
      )}

      {uploaded && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            {t("import.step1.scanChoiceLabel")}
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <ScanChoiceCard
              selected={wantScan === true}
              onClick={() => onChooseScan(true)}
              title={t("import.step1.scanYesTitle")}
              body={t("import.step1.scanYesBody")}
            />
            <ScanChoiceCard
              selected={wantScan === false}
              onClick={() => onChooseScan(false)}
              title={t("import.step1.scanNoTitle")}
              body={t("import.step1.scanNoBody")}
            />
          </div>
          {scanning && (
            <p className="text-sm text-ink-muted">
              {t("import.step1.scanning")}
            </p>
          )}
          {!scanning && scan && wantScan && (
            <div className="rounded-xl bg-chip p-4 text-sm">
              <p className="text-ink">
                {scan.items.length === 0
                  ? t("import.step1.scanClean")
                  : t("import.step1.scanFlagged", { count: scan.items.length })}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{scan.disclaimer}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** The chosen card carries a full-ink border: depth in a line, never a shadow. */
function ScanChoiceCard({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-input p-4 text-left outline-none",
        "transition-[background-color,border-color,transform] duration-200",
        "active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-focus/50",
        selected ? "border-ink" : "border-ink/5 hover:border-ink/15",
      )}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{body}</p>
    </button>
  );
}
