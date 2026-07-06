import { HoustonAvatar } from "@houston-ai/core";
import i18n from "../../lib/i18n";

/**
 * Full-screen boot splash: a rounded card with the Houston helmet inside the
 * spinning comet halo (the same `running` treatment chat avatars get, scaled
 * up) so the wait always shows movement. One component covers every boot
 * blocker — the engine handshake (EngineGate, desktop + web), the auth-session
 * resolve, and the first workspace/agent load (App.tsx) — so the whole startup
 * reads as a single continuous "loading your workspace" state.
 *
 * Reads the i18n singleton directly (not useTranslation): the web EngineGate
 * renders this OUTSIDE <I18nextProvider>, and at gate time the saved language
 * isn't applied yet anyway (LanguageGate mounts after the engine is ready).
 */
export function WorkspaceLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6 text-foreground">
      <div
        role="status"
        className="workspace-loading-card flex w-full max-w-xs flex-col items-center gap-7 rounded-3xl border border-border bg-card px-10 py-14 shadow-[0_16px_60px_rgba(0,0,0,0.08)]"
      >
        <HoustonAvatar diameter={96} running />
        <p className="text-sm text-muted-foreground">
          {i18n.t("shell:engineGate.starting")}
        </p>
      </div>
    </div>
  );
}
