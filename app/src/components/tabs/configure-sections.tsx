import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";

// ── Section wrapper ──────────────────────────────────────────────

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {description && (
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          {description}
        </p>
      )}
      {!description && <div className="mb-3" />}
      {children}
    </section>
  );
}

// ── Auto-save textarea ───────────────────────────────────────────

export function AutoSaveTextarea({
  value: initialValue,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (content: string) => Promise<unknown>;
  placeholder?: string;
}) {
  const { t } = useTranslation("agents");
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleBlur = async () => {
    if (value !== initialValue) {
      setSaving(true);
      await onSave(value);
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      {saving && (
        <span className="absolute top-2 right-3 text-[10px] text-muted-foreground/50">
          {t("configure.settings.savingHint")}
        </span>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={Math.max(6, value.split("\n").length + 1)}
        className="w-full text-sm text-foreground leading-relaxed bg-secondary outline-none rounded-xl px-4 py-3 border border-border/30 hover:border-border/60 focus:border-border focus:bg-background transition-all duration-200 resize-none placeholder:text-muted-foreground/30"
      />
    </div>
  );
}

// ── Settings form ────────────────────────────────────────────────

export function SettingsForm({
  agentPath,
  config,
}: {
  agentPath: string;
  config: Record<string, unknown>;
}) {
  const { t } = useTranslation("agents");
  const qc = useQueryClient();
  const [devCommand, setDevCommand] = useState(
    (config.devCommand as string) ?? "",
  );
  const [installCommand, setInstallCommand] = useState(
    (config.installCommand as string) ?? "",
  );
  const [worktreeMode, setWorktreeMode] = useState(
    (config.worktreeMode as boolean) ?? false,
  );

  useEffect(() => {
    setDevCommand((config.devCommand as string) ?? "");
    setInstallCommand((config.installCommand as string) ?? "");
    setWorktreeMode((config.worktreeMode as boolean) ?? false);
  }, [config]);

  const saveConfig = useCallback(
    async (updates: Record<string, unknown>) => {
      const merged = { ...config, ...updates };
      await tauriConfig.write(agentPath, merged);
      qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) });
    },
    [agentPath, config, qc],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-muted-foreground block">
            {t("configure.settings.worktreeMode")}
          </label>
          <span className="text-xs text-muted-foreground/60">
            {t("configure.settings.worktreeModeDescription")}
          </span>
        </div>
        <button
          onClick={() => {
            const next = !worktreeMode;
            setWorktreeMode(next);
            saveConfig({ worktreeMode: next });
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            worktreeMode ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
              worktreeMode ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
          {t("configure.settings.installCommand")}
        </label>
        <input
          type="text"
          value={installCommand}
          onChange={(e) => setInstallCommand(e.target.value)}
          onBlur={() => saveConfig({ installCommand })}
          placeholder={t("configure.settings.installCommandPlaceholder")}
          className="w-full rounded-xl border border-border/30 bg-secondary px-4 py-2.5 text-sm text-foreground outline-none hover:border-border/60 focus:border-border focus:bg-background transition-all duration-200 placeholder:text-muted-foreground/30"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
          {t("configure.settings.devCommand")}
        </label>
        <input
          type="text"
          value={devCommand}
          onChange={(e) => setDevCommand(e.target.value)}
          onBlur={() => saveConfig({ devCommand })}
          placeholder={t("configure.settings.devCommandPlaceholder")}
          className="w-full rounded-xl border border-border/30 bg-secondary px-4 py-2.5 text-sm text-foreground outline-none hover:border-border/60 focus:border-border focus:bg-background transition-all duration-200 placeholder:text-muted-foreground/30"
        />
      </div>
    </div>
  );
}
