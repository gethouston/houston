/**
 * Share an agent with a friend — 3 calm screens.
 *
 *   1. Pick what to share. CLAUDE.md is implicit; skills, routines,
 *      learnings get per-item switches.
 *   2. Optionally let Houston anonymize. Side-by-side diffs.
 *   3. Save the file.
 *
 * Visual language follows `knowledge-base/design-system.md` — near-black
 * text on white, no decorative icons, sentence-case sections, big calm
 * h1, progress dots beside the eyebrow (close button owns the right
 * corner). Switches match the routine editor.
 */

import { Button, cn, Dialog, DialogContent, Switch } from "@houston-ai/core";
import type {
  PortableAnonymizeResponse,
  PortableInventoryPreview,
} from "@houston-ai/engine-client";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-toast";
import { osRevealPath } from "../../lib/os-bridge";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";

type StepId = "pick" | "anonymize" | "save";

const steps: StepId[] = ["pick", "anonymize", "save"];

interface Selection {
  claudeMd: boolean;
  skillSlugs: Set<string>;
  routineIds: Set<string>;
  learningIds: Set<string>;
}

interface AnonymizeAccept {
  claudeMd: boolean;
  skills: Record<string, boolean>;
  routines: Record<string, boolean>;
  learnings: Record<string, boolean>;
}

export function ExportAgentWizard() {
  const { t } = useTranslation("portable");
  const agentId = useUIStore((s) => s.shareAgentId);
  const setAgentId = useUIStore((s) => s.setShareAgentId);
  const addToast = useUIStore((s) => s.addToast);
  const agents = useAgentStore((s) => s.agents);
  const agent = agents.find((a) => a.id === agentId);
  const open = Boolean(agentId);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex] ?? "pick";
  const [preview, setPreview] = useState<PortableInventoryPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>({
    claudeMd: true,
    skillSlugs: new Set(),
    routineIds: new Set(),
    learningIds: new Set(),
  });
  const [wantAnonymize, setWantAnonymize] = useState<boolean | null>(null);
  const [anonymizing, setAnonymizing] = useState(false);
  const [anonymized, setAnonymized] =
    useState<PortableAnonymizeResponse | null>(null);
  const [accept, setAccept] = useState<AnonymizeAccept>({
    claudeMd: true,
    skills: {},
    routines: {},
    learnings: {},
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setStepIndex(0);
      setPreview(null);
      setWantAnonymize(null);
      setAnonymized(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const p = await getEngine().portablePreview(agent?.folderPath ?? "");
        setPreview(p);
        setSelection({
          claudeMd: Boolean(p.claudeMd),
          skillSlugs: new Set(p.skills.map((s: { slug: string }) => s.slug)),
          routineIds: new Set(p.routines.map((r: { id: string }) => r.id)),
          learningIds: new Set(p.learnings.map((l: { id: string }) => l.id)),
        });
      } catch (err) {
        addToast({
          variant: "error",
          title: t("export.errors.previewFailed"),
          description: genericErrorDescription("export_preview", err),
        });
        setAgentId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, agent?.folderPath, addToast, setAgentId, t]);

  const counts = useMemo(
    () => ({
      skills: selection.skillSlugs.size,
      routines: selection.routineIds.size,
      learnings: selection.learningIds.size,
    }),
    [selection],
  );

  const handleClose = useCallback(() => setAgentId(null), [setAgentId]);

  const runAnonymize = async () => {
    if (!agent || !preview) return;
    setAnonymizing(true);
    try {
      const result = await getEngine().portableAnonymize(agent.folderPath, {
        claudeMd: selection.claudeMd,
        skillSlugs: Array.from(selection.skillSlugs),
        routineIds: Array.from(selection.routineIds),
        learningIds: Array.from(selection.learningIds),
      });
      setAnonymized(result);
      setAccept({
        claudeMd: !(result.claudeMd?.becameEmpty ?? false),
        skills: Object.fromEntries(
          result.skills.map((s: { id: string; becameEmpty: boolean }) => [
            s.id,
            !s.becameEmpty,
          ]),
        ),
        routines: Object.fromEntries(
          result.routines.map((r: { id: string }) => [r.id, true]),
        ),
        learnings: Object.fromEntries(
          result.learnings.map((l: { id: string; becameEmpty: boolean }) => [
            l.id,
            !l.becameEmpty,
          ]),
        ),
      });
    } catch (err) {
      addToast({
        variant: "error",
        title: t("export.errors.anonymizeFailed"),
        description: genericErrorDescription("export_anonymize", err),
      });
    } finally {
      setAnonymizing(false);
    }
  };

  const buildOverrides = () => {
    if (!wantAnonymize || !anonymized) return undefined;
    const ov: Record<string, unknown> = {};
    if (accept.claudeMd && anonymized.claudeMd) {
      ov.claudeMd = anonymized.claudeMd.after;
    }
    const skillBodies: Record<string, string> = {};
    for (const s of anonymized.skills) {
      if (accept.skills[s.id]) skillBodies[s.id] = s.after;
    }
    if (Object.keys(skillBodies).length) ov.skillBodies = skillBodies;
    const routineFields: Record<string, unknown> = {};
    for (const r of anonymized.routines) {
      if (accept.routines[r.id]) routineFields[r.id] = r.overridePayload;
    }
    if (Object.keys(routineFields).length) ov.routineFields = routineFields;
    const learningTexts: Record<string, string> = {};
    for (const l of anonymized.learnings) {
      if (accept.learnings[l.id]) learningTexts[l.id] = l.after;
    }
    if (Object.keys(learningTexts).length) ov.learningTexts = learningTexts;
    return ov;
  };

  const handleSave = async () => {
    if (!agent || !preview) return;
    setSaving(true);
    try {
      const dropLearnings = new Set<string>();
      if (wantAnonymize && anonymized) {
        for (const l of anonymized.learnings) {
          if (l.becameEmpty && !accept.learnings[l.id]) dropLearnings.add(l.id);
        }
      }
      const bytes = await getEngine().portablePackage(agent.folderPath, {
        selection: {
          includeClaudeMd: selection.claudeMd,
          includeSkillSlugs: Array.from(selection.skillSlugs),
          includeRoutineIds: Array.from(selection.routineIds),
          includeLearningIds: Array.from(selection.learningIds).filter(
            (id) => !dropLearnings.has(id),
          ),
        },
        overrides: buildOverrides() as never,
        meta: {
          agentId: agent.configId ?? agent.id,
          agentName: agent.name,
          anonymized: wantAnonymize ?? false,
        },
      });
      const filename = `${agent.name.replace(/[^a-z0-9._-]+/gi, "-")}.houstonagent`;
      const u8 = new Uint8Array(bytes);
      const savedPath = await invoke<string | null>("save_portable_agent", {
        default_name: filename,
        bytes: Array.from(u8),
      });
      if (savedPath) {
        analytics.track("agent_shared", { agent_slug: agent.id });
        addToast({
          variant: "success",
          title: t("export.toasts.savedTitle"),
          description: t("export.toasts.savedDescription", { path: savedPath }),
          action: {
            label: t("export.toasts.revealAction"),
            onClick: () => {
              void osRevealPath(savedPath).catch((err) =>
                addToast({
                  variant: "error",
                  title: t("export.errors.revealFailed"),
                  description: genericErrorDescription("export_reveal", err),
                }),
              );
            },
          },
        });
        handleClose();
      }
    } catch (err) {
      addToast({
        variant: "error",
        title: t("export.errors.saveFailed"),
        description: genericErrorDescription("export_save", err),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const canAdvance =
    currentStep === "pick"
      ? !loading && !!preview
      : currentStep === "anonymize"
        ? wantAnonymize !== null && !anonymizing
        : true;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[680px] h-[78vh] flex flex-col p-0 gap-0 overflow-hidden">
        <WizardHeader
          eyebrow={t("export.eyebrow", { name: agent?.name ?? "" })}
          index={stepIndex}
          total={steps.length}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-2 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("export.loading")}
            </p>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground">
              {t("export.errors.noPreview")}
            </p>
          ) : currentStep === "pick" ? (
            <PickStep
              preview={preview}
              selection={selection}
              setSelection={setSelection}
            />
          ) : currentStep === "anonymize" ? (
            <AnonymizeStep
              wantAnonymize={wantAnonymize}
              onChoose={(v) => {
                setWantAnonymize(v);
                if (v && !anonymized) void runAnonymize();
              }}
              anonymizing={anonymizing}
              anonymized={anonymized}
              accept={accept}
              setAccept={setAccept}
            />
          ) : (
            <SaveStep
              agentName={agent?.name ?? ""}
              counts={counts}
              anonymized={wantAnonymize ?? false}
            />
          )}
        </div>

        <footer className="shrink-0 px-8 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              stepIndex > 0 ? setStepIndex(stepIndex - 1) : handleClose()
            }
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {stepIndex > 0
              ? t("export.actions.back")
              : t("export.actions.cancel")}
          </button>
          {stepIndex < steps.length - 1 ? (
            <Button
              className="rounded-full"
              onClick={() => setStepIndex(stepIndex + 1)}
              disabled={!canAdvance}
            >
              {t("export.actions.next")}
            </Button>
          ) : (
            <Button
              className="rounded-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t("export.actions.saving") : t("export.actions.save")}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Steps ─────────────────────────────────────────────────────────────

function PickStep({
  preview,
  selection,
  setSelection,
}: {
  preview: PortableInventoryPreview;
  selection: Selection;
  setSelection: (s: Selection) => void;
}) {
  const { t } = useTranslation("portable");
  const toggleSkill = (slug: string) => {
    const next = new Set(selection.skillSlugs);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    setSelection({ ...selection, skillSlugs: next });
  };
  const toggleRoutine = (id: string) => {
    const next = new Set(selection.routineIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelection({ ...selection, routineIds: next });
  };
  const toggleLearning = (id: string) => {
    const next = new Set(selection.learningIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelection({ ...selection, learningIds: next });
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("export.step1.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("export.step1.body")}
        </p>
      </header>

      <Section title={t("export.step1.instructionsLabel")}>
        {preview.claudeMd ? (
          <SwitchRow
            checked={selection.claudeMd}
            onChange={() =>
              setSelection({ ...selection, claudeMd: !selection.claudeMd })
            }
            title={t("export.step1.instructionsRow")}
            subtitle={preview.claudeMd.excerpt}
          />
        ) : (
          <Subtle>{t("export.step1.noInstructions")}</Subtle>
        )}
      </Section>

      {preview.skills.length > 0 && (
        <Section title={t("export.step1.skillsLabel")}>
          {preview.skills.map((s) => (
            <SwitchRow
              key={s.slug}
              checked={selection.skillSlugs.has(s.slug)}
              onChange={() => toggleSkill(s.slug)}
              title={humanize(s.slug)}
              subtitle={s.description}
            />
          ))}
        </Section>
      )}

      {preview.routines.length > 0 && (
        <Section title={t("export.step1.routinesLabel")}>
          {preview.routines.map((r) => (
            <SwitchRow
              key={r.id}
              checked={selection.routineIds.has(r.id)}
              onChange={() => toggleRoutine(r.id)}
              title={r.name}
              subtitle={r.promptExcerpt}
            />
          ))}
        </Section>
      )}

      {preview.learnings.length > 0 && (
        <Section title={t("export.step1.learningsLabel")}>
          {preview.learnings.map((l) => (
            <SwitchRow
              key={l.id}
              checked={selection.learningIds.has(l.id)}
              onChange={() => toggleLearning(l.id)}
              title={l.text}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function AnonymizeStep({
  wantAnonymize,
  onChoose,
  anonymizing,
  anonymized,
  accept,
  setAccept,
}: {
  wantAnonymize: boolean | null;
  onChoose: (v: boolean) => void;
  anonymizing: boolean;
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
          <h2 className="text-sm font-medium">
            {t("export.step2.reviewLabel")}
          </h2>
          {anonymizing && (
            <div className="space-y-3">
              <div className="running-glow-line bg-foreground/5" aria-hidden />
              <Subtle>{t("export.step2.working")}</Subtle>
            </div>
          )}
          {!anonymizing &&
            anonymized?.mode === "patterns" &&
            anonymized.aiError && (
              <p className="text-xs text-muted-foreground rounded-lg bg-secondary p-3">
                {t("export.step2.aiFallback", { reason: anonymized.aiError })}
              </p>
            )}
          {!anonymizing && anonymized && (
            <div className="space-y-3">
              {anonymized.claudeMd && (
                <DiffCard
                  title={t("export.step2.diffInstructions")}
                  before={anonymized.claudeMd.before}
                  after={anonymized.claudeMd.after}
                  summary={anonymized.claudeMd.summary}
                  becameEmpty={anonymized.claudeMd.becameEmpty}
                  accepted={accept.claudeMd}
                  onToggle={() =>
                    setAccept({ ...accept, claudeMd: !accept.claudeMd })
                  }
                />
              )}
              {anonymized.skills.map((s) => (
                <DiffCard
                  key={s.id}
                  title={humanize(s.id)}
                  before={s.before}
                  after={s.after}
                  summary={s.summary}
                  becameEmpty={s.becameEmpty}
                  accepted={accept.skills[s.id] ?? true}
                  onToggle={() =>
                    setAccept({
                      ...accept,
                      skills: {
                        ...accept.skills,
                        [s.id]: !accept.skills[s.id],
                      },
                    })
                  }
                />
              ))}
              {anonymized.routines.map((r) =>
                r.fieldDiffs.length > 0 ? (
                  <RoutineDiffCard
                    key={r.id}
                    routineId={r.id}
                    fieldDiffs={r.fieldDiffs}
                    accepted={accept.routines[r.id] ?? true}
                    onToggle={() =>
                      setAccept({
                        ...accept,
                        routines: {
                          ...accept.routines,
                          [r.id]: !accept.routines[r.id],
                        },
                      })
                    }
                  />
                ) : null,
              )}
              {anonymized.learnings.map((l) => (
                <DiffCard
                  key={l.id}
                  title={t("export.step2.learningTitle")}
                  before={l.before}
                  after={l.after}
                  summary={l.summary}
                  becameEmpty={l.becameEmpty}
                  accepted={accept.learnings[l.id] ?? true}
                  onToggle={() =>
                    setAccept({
                      ...accept,
                      learnings: {
                        ...accept.learnings,
                        [l.id]: !accept.learnings[l.id],
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SaveStep({
  agentName,
  counts,
  anonymized,
}: {
  agentName: string;
  counts: { skills: number; routines: number; learnings: number };
  anonymized: boolean;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("export.step3.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("export.step3.body", { name: agentName })}
        </p>
      </header>

      <dl className="space-y-2 text-sm">
        <SummaryRow
          label={t("export.step3.skillsLabel")}
          value={counts.skills}
        />
        <SummaryRow
          label={t("export.step3.routinesLabel")}
          value={counts.routines}
        />
        <SummaryRow
          label={t("export.step3.learningsLabel")}
          value={counts.learnings}
        />
        <SummaryRow
          label={t("export.step3.anonymizedLabel")}
          value={anonymized ? t("export.step3.yes") : t("export.step3.no")}
        />
      </dl>
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────

export function WizardHeader({
  eyebrow,
  index,
  total,
}: {
  eyebrow: string;
  index: number;
  total: number;
}) {
  // Eyebrow + dots both pinned to the LEFT so radix's absolute-positioned
  // close button (`top-4 right-4`) keeps its own column.
  return (
    <header className="shrink-0 px-8 pt-6 pb-2 flex items-center gap-4">
      <p className="text-xs text-muted-foreground">{eyebrow}</p>
      <ProgressDots index={index} total={total} />
    </header>
  );
}

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional counters — no identity field exists; order is invariant
          key={`dot-${i}`}
          className={cn(
            "size-2 rounded-full transition-colors",
            i < index && "bg-foreground/60",
            i === index && "bg-foreground",
            i > index && "bg-foreground/15",
          )}
        />
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function SwitchRow({
  checked,
  onChange,
  title,
  subtitle,
  trailing,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0 mt-0.5">{trailing}</div>}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function ChoiceCard({
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
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-background p-4 text-left transition-all",
        "border-foreground/5 hover:border-foreground/15 hover:shadow-[0_1px_0_rgba(0,0,0,0.05)]",
        selected && "border-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </button>
  );
}

function DiffCard({
  title,
  before,
  after,
  summary,
  becameEmpty,
  accepted,
  onToggle,
}: {
  title: string;
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
  accepted: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <article className="rounded-xl border border-foreground/5 bg-background p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {accepted ? t("export.step2.keep") : t("export.step2.skip")}
        </button>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Pane
          label={t("export.step2.before")}
          body={before}
          dimmed={accepted}
        />
        <Pane label={t("export.step2.after")} body={after} dimmed={!accepted} />
      </div>
      <p className="text-xs text-muted-foreground mt-3">{summary}</p>
      {becameEmpty && (
        <p className="text-xs text-muted-foreground mt-1">
          {t("export.step2.becameEmpty")}
        </p>
      )}
    </article>
  );
}

function RoutineDiffCard({
  routineId,
  fieldDiffs,
  accepted,
  onToggle,
}: {
  routineId: string;
  fieldDiffs: { field: string; before: string; after: string }[];
  accepted: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <article className="rounded-xl border border-foreground/5 bg-background p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium">
          {t("export.step2.routineTitle", { id: routineId })}
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {accepted ? t("export.step2.keep") : t("export.step2.skip")}
        </button>
      </header>
      <div className="space-y-3">
        {fieldDiffs.map((d) => (
          <div key={d.field} className="grid grid-cols-2 gap-3">
            <Pane
              label={`${d.field} · ${t("export.step2.before")}`}
              body={d.before}
              dimmed={accepted}
            />
            <Pane
              label={`${d.field} · ${t("export.step2.after")}`}
              body={d.after}
              dimmed={!accepted}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function Pane({
  label,
  body,
  dimmed,
}: {
  label: string;
  body: string;
  dimmed: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-secondary p-3", dimmed && "opacity-40")}>
      <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
      <pre className="text-xs whitespace-pre-wrap break-words font-sans line-clamp-6">
        {body}
      </pre>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
