/**
 * Import an agent shared by a friend — a small, calm flow.
 *
 *   1. Upload + optional threat scan.
 *   2. Name + color + provider (helmet preview).
 *   3. Skills picker        — skipped if package has none.
 *   4. Routines picker      — skipped if package has none.
 *   5. Learnings picker     — skipped if package has none.
 *   6. Required integrations — skipped if no toolkit slug is referenced.
 *
 * The CLAUDE.md (instructions) always rides along — it's the agent's
 * identity. The wizard does not expose a toggle for it.
 *
 * Visual language: `knowledge-base/design-system.md` plus the existing
 * `NamingStep` for name+color, so it feels exactly like creating an
 * agent from scratch.
 */

import {
  AGENT_COLORS,
  Button,
  cn,
  colorHex,
  Dialog,
  DialogContent,
  HoustonAvatar,
  Input,
  resolveAgentColor,
  Switch,
} from "@houston-ai/core";
import type {
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "@houston-ai/engine-client";
import { invoke } from "@tauri-apps/api/core";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { getEngine } from "../../lib/engine";
import { getDefaultModel } from "../../lib/providers";
import { tauriConfig, tauriProvider } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { InlineModelSelector } from "../shell/naming-step";

type StepId = "upload" | "name" | "skills" | "routines" | "learnings";

interface Selection {
  skillSlugs: Set<string>;
  routineIds: Set<string>;
  learningIds: Set<string>;
}

export function ImportAgentWizard() {
  const { t } = useTranslation("portable");
  const open = useUIStore((s) => s.importFromFriendOpen);
  const setOpen = useUIStore((s) => s.setImportFromFriendOpen);
  const addToast = useUIStore((s) => s.addToast);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const loadAgents = useAgentStore((s) => s.loadAgents);

  const [stepIndex, setStepIndex] = useState(0);
  const [uploaded, setUploaded] =
    useState<PortableUploadPreviewResponse | null>(null);
  const [wantScan, setWantScan] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<PortableScanResponse | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(AGENT_COLORS[0].id);
  const [provider, setProvider] = useState<string>("anthropic");
  const [model, setModel] = useState<string>(getDefaultModel("anthropic"));

  // Read the sticky default whenever the wizard opens so the picker starts
  // from the user's last pick (made in the create-agent dialog, AI-assist
  // step, or chat-tab picker). Falls back to Anthropic if nothing was ever
  // stored (fresh install).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    tauriProvider.getLastUsed().then(({ provider: p, model: m }) => {
      if (cancelled) return;
      const next = p ?? "anthropic";
      setProvider(next);
      setModel(m ?? getDefaultModel(next));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  const [selection, setSelection] = useState<Selection>({
    skillSlugs: new Set(),
    routineIds: new Set(),
    learningIds: new Set(),
  });
  const [installing, setInstalling] = useState(false);

  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = ["upload", "name"];
    if (!uploaded) return out;
    if (uploaded.preview.skills.length > 0) out.push("skills");
    if (uploaded.preview.routines.length > 0) out.push("routines");
    if (uploaded.preview.learnings.length > 0) out.push("learnings");
    return out;
  }, [uploaded]);

  const currentStep = steps[stepIndex] ?? "upload";
  const isLast = stepIndex === steps.length - 1;

  const reset = useCallback(() => {
    setStepIndex(0);
    setUploaded(null);
    setScan(null);
    setWantScan(null);
    setName("");
    setColor(AGENT_COLORS[0].id);
    // Provider/model intentionally NOT reset here — the open-effect above
    // re-hydrates them from `tauriProvider.getLastUsed()` on the next open.
    setSelection({
      skillSlugs: new Set(),
      routineIds: new Set(),
      learningIds: new Set(),
    });
  }, []);

  const runScan = async (packageId: string) => {
    setScanning(true);
    try {
      setScan(await getEngine().importScan(packageId));
    } finally {
      setScanning(false);
    }
  };

  const handleOpenFile = async () => {
    try {
      const bytes = await invoke<number[] | null>("open_portable_agent");
      if (!bytes) return;
      const u8 = new Uint8Array(bytes);
      const result = await getEngine().importPreview(u8.buffer);
      setUploaded(result);
      setSelection({
        skillSlugs: new Set(
          result.preview.skills.map((s: { slug: string }) => s.slug),
        ),
        routineIds: new Set(
          result.preview.routines.map((r: { id: string }) => r.id),
        ),
        learningIds: new Set(
          result.preview.learnings.map((l: { id: string }) => l.id),
        ),
      });
      if (!name && result.manifest.agentName)
        setName(result.manifest.agentName);
    } catch (err) {
      addToast({
        variant: "error",
        title: t("import.errors.uploadFailed"),
        description: String(err),
      });
    }
  };

  const handleChooseScan = async (yes: boolean) => {
    setWantScan(yes);
    if (yes && uploaded && !scan) {
      await runScan(uploaded.packageId);
    }
  };

  const findingsForId = useCallback(
    (kind: string, id: string) =>
      scan?.items.filter((i) => i.kind === kind && i.id === id) ?? [],
    [scan],
  );

  const handleInstall = async () => {
    if (!uploaded || !currentWorkspace) return;
    if (!name.trim()) {
      addToast({ variant: "error", title: t("import.errors.nameRequired") });
      return;
    }
    setInstalling(true);
    try {
      const installed = await getEngine().importInstall({
        packageId: uploaded.packageId,
        workspaceName: currentWorkspace.name,
        agentName: name.trim(),
        agentColor: color,
        selection: {
          includeClaudeMd: true,
          includeSkillSlugs: Array.from(selection.skillSlugs),
          includeRoutineIds: Array.from(selection.routineIds),
          includeLearningIds: Array.from(selection.learningIds),
        },
      });
      // Always persist provider/model on the imported agent's config — same
      // contract as the create-agent dialog. Workspace-level defaults are
      // gone, so a blank field would resolve to the platform default.
      const cfg = await tauriConfig.read(installed.agentPath);
      await tauriConfig.write(installed.agentPath, {
        ...cfg,
        provider: provider as "anthropic" | "openai",
        model,
      });
      await tauriProvider.setLastUsed(provider, model);
      await loadAgents(currentWorkspace.id);
      analytics.track("agent_imported", { agent_slug: installed.agentName });
      addToast({
        variant: "success",
        title: t("import.toasts.installedTitle"),
        description: t("import.toasts.installedDescription", {
          name: installed.agentName,
        }),
      });
      setOpen(false);
      reset();
    } catch (err) {
      addToast({
        variant: "error",
        title: t("import.errors.installFailed"),
        description: String(err),
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset, setOpen]);

  if (!open) return null;

  const canAdvance =
    currentStep === "upload"
      ? !!uploaded && wantScan !== null && !scanning
      : currentStep === "name"
        ? name.trim().length > 0
        : true;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[680px] h-[78vh] flex flex-col p-0 gap-0 overflow-hidden">
        <header className="shrink-0 px-8 pt-6 pb-2 flex items-center gap-4">
          <p className="text-xs text-muted-foreground">{t("import.eyebrow")}</p>
          <ProgressDots index={stepIndex} total={steps.length} />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {currentStep === "upload" && (
            <Frame>
              <UploadStep
                uploaded={uploaded}
                wantScan={wantScan}
                onChooseScan={handleChooseScan}
                onPick={handleOpenFile}
                scanning={scanning}
                scan={scan}
              />
            </Frame>
          )}
          {currentStep === "name" && (
            <NameStep
              name={name}
              onNameChange={setName}
              color={color}
              onColorChange={setColor}
              provider={provider}
              model={model}
              onProviderChange={(p, m) => {
                setProvider(p);
                setModel(m);
              }}
            />
          )}
          {currentStep === "skills" && uploaded && (
            <Frame>
              <PickListStep
                title={t("import.step3.title")}
                body={t("import.step3.body")}
                items={uploaded.preview.skills}
                selected={selection.skillSlugs}
                setSelected={(next) =>
                  setSelection({ ...selection, skillSlugs: next })
                }
                getId={(s) => s.slug}
                renderRow={(s) => ({
                  title: s.description || humanize(s.slug),
                  subtitle: humanize(s.slug),
                  flagged: findingsForId("skill", s.slug).length > 0,
                })}
              />
            </Frame>
          )}
          {currentStep === "routines" && uploaded && (
            <Frame>
              <PickListStep
                title={t("import.step4.title")}
                body={t("import.step4.body")}
                items={uploaded.preview.routines}
                selected={selection.routineIds}
                setSelected={(next) =>
                  setSelection({ ...selection, routineIds: next })
                }
                getId={(r) => r.id}
                renderRow={(r) => ({
                  title: r.name,
                  subtitle: r.description || r.promptExcerpt,
                  flagged: findingsForId("routine", r.id).length > 0,
                })}
              />
            </Frame>
          )}
          {currentStep === "learnings" && uploaded && (
            <Frame>
              <PickListStep
                title={t("import.step5.title")}
                body={t("import.step5.body")}
                items={uploaded.preview.learnings}
                selected={selection.learningIds}
                setSelected={(next) =>
                  setSelection({ ...selection, learningIds: next })
                }
                getId={(l) => l.id}
                renderRow={(l) => ({
                  title: l.text,
                  flagged: findingsForId("learning", l.id).length > 0,
                })}
              />
            </Frame>
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
              ? t("import.actions.back")
              : t("import.actions.cancel")}
          </button>
          {!isLast ? (
            <Button
              className="rounded-full"
              onClick={() => setStepIndex(stepIndex + 1)}
              disabled={!canAdvance}
            >
              {t("import.actions.next")}
            </Button>
          ) : (
            <Button
              className="rounded-full"
              onClick={handleInstall}
              disabled={installing}
            >
              {installing
                ? t("import.actions.installing")
                : t("import.actions.install")}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Steps ─────────────────────────────────────────────────────────────

function UploadStep({
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
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("import.step1.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("import.step1.body")}
        </p>
      </header>

      {!uploaded ? (
        <div>
          <Button onClick={onPick} className="rounded-full">
            {t("import.step1.pickFile")}
          </Button>
        </div>
      ) : (
        <section className="space-y-2 text-sm">
          <p className="text-foreground">{uploaded.manifest.agentName}</p>
          <p className="text-muted-foreground">
            {t("import.step1.uploadedFrom", {
              name: uploaded.manifest.exporter ?? t("import.step1.anonymous"),
            })}
          </p>
          <p className="text-muted-foreground tabular-nums">
            {t("import.step1.counts", {
              skills: uploaded.preview.skills.length,
              routines: uploaded.preview.routines.length,
              learnings: uploaded.preview.learnings.length,
            })}
          </p>
          {uploaded.manifest.anonymized && (
            <p className="text-muted-foreground">
              {t("import.step1.anonymizedFlag")}
            </p>
          )}
        </section>
      )}

      {uploaded && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            {t("import.step1.scanChoiceLabel")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChoiceCard
              selected={wantScan === true}
              onClick={() => onChooseScan(true)}
              title={t("import.step1.scanYesTitle")}
              body={t("import.step1.scanYesBody")}
            />
            <ChoiceCard
              selected={wantScan === false}
              onClick={() => onChooseScan(false)}
              title={t("import.step1.scanNoTitle")}
              body={t("import.step1.scanNoBody")}
            />
          </div>
          {scanning && (
            <p className="text-sm text-muted-foreground">
              {t("import.step1.scanning")}
            </p>
          )}
          {!scanning && scan && wantScan && (
            <div className="rounded-xl bg-secondary p-4 text-sm">
              <p className="text-foreground">
                {scan.items.length === 0
                  ? t("import.step1.scanClean")
                  : t("import.step1.scanFlagged", { count: scan.items.length })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {scan.disclaimer}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Name + color + provider — mirrors `NamingStep` from create-workspace
 * so users get the same "name your new agent" muscle memory.
 */
function NameStep({
  name,
  onNameChange,
  color,
  onColorChange,
  provider,
  model,
  onProviderChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
  color: string;
  onColorChange: (v: string) => void;
  provider: string;
  model: string;
  onProviderChange: (p: string, m: string) => void;
}) {
  const { t } = useTranslation("portable");
  const resolvedColor = resolveAgentColor(color);
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="flex flex-col items-center gap-4 mb-8">
        <HoustonAvatar color={resolvedColor} diameter={80} />
        <div className="text-center">
          <p className="text-lg font-semibold">
            {name.trim() || t("import.step2.placeholderName")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("import.step2.tagline")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {AGENT_COLORS.map((c) => {
          const hex = colorHex(c);
          const isSelected =
            color === c.id || color === c.light || color === c.dark;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onColorChange(c.id)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-offset-2 ring-foreground/30"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          );
        })}
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("import.step2.namePlaceholder")}
          className="text-center rounded-full"
        />
        <InlineModelSelector
          provider={provider}
          model={model}
          onSelect={onProviderChange}
        />
      </div>
    </div>
  );
}

interface PickListStepProps<T> {
  title: string;
  body: string;
  items: T[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  getId: (item: T) => string;
  renderRow: (item: T) => {
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
    flagged?: boolean;
  };
}

function PickListStep<T>({
  title,
  body,
  items,
  selected,
  setSelected,
  getId,
  renderRow,
}: PickListStepProps<T>) {
  const { t } = useTranslation("portable");
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{body}</p>
      </header>

      <div>
        <div className="flex justify-end gap-4 mb-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setSelected(new Set(items.map(getId)))}
            className="hover:text-foreground"
          >
            {t("import.actions.selectAll")}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="hover:text-foreground"
          >
            {t("import.actions.clearAll")}
          </button>
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const id = getId(item);
            const row = renderRow(item);
            return (
              <SwitchRow
                key={id}
                checked={selected.has(id)}
                onChange={() => toggle(id)}
                title={row.title}
                subtitle={row.subtitle}
                trailing={row.trailing}
                flaggedNote={row.flagged ? t("import.flagged") : null}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="px-8 pt-2 pb-6">{children}</div>;
}

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are purely positional — generated from a length, no real items or ids exist
          key={i}
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
        "border-black/5 hover:border-black/15 hover:shadow-[0_1px_0_rgba(0,0,0,0.05)]",
        selected && "border-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </button>
  );
}

function SwitchRow({
  checked,
  onChange,
  title,
  subtitle,
  trailing,
  flaggedNote,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  flaggedNote?: string | null;
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
        {flaggedNote && (
          <p className="text-xs text-muted-foreground mt-1">{flaggedNote}</p>
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

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
