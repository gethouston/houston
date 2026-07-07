import { HoustonAvatar } from "@houston-ai/core";
import i18n from "../../lib/i18n";
import { SpaceScreen } from "../space/space-screen";

/**
 * Full-screen boot splash: a rounded card with the Houston helmet inside the
 * spinning comet halo (the same `running` treatment chat avatars get, scaled
 * up) so the wait always shows movement. One component covers every boot
 * blocker — the engine handshake (EngineGate, desktop + web), the auth-session
 * resolve, and the first workspace/agent load (App.tsx) — so the whole startup
 * reads as a single continuous "loading your workspace" state.
 *
 * Renders on the shared {@link SpaceScreen} space backdrop (WebGL nebula +
 * starfield), same as the sign-in screen, with the card pinned to the light
 * palette (`data-theme="light"`) so it reads as a bright, calm card floating in
 * space regardless of app theme.
 *
 * Reads the i18n singleton directly (not useTranslation): the web EngineGate
 * renders this OUTSIDE <I18nextProvider>, and at gate time the saved language
 * isn't applied yet anyway (LanguageGate mounts after the engine is ready).
 */
export function WorkspaceLoading() {
  return (
    <SpaceScreen>
      <div className="flex flex-1 items-center justify-center px-6">
        {/* data-theme="light" pins the card to the light palette so it reads as
            a bright card on the theme-invariant space backdrop, matching the
            sign-in screen's visual language. */}
        <div
          data-theme="light"
          role="status"
          className="workspace-loading-card flex w-full max-w-xs flex-col items-center gap-7 rounded-3xl border border-border bg-background px-10 py-14 text-foreground shadow-2xl"
        >
          <HoustonAvatar diameter={96} running />
          <p className="text-sm text-muted-foreground">
            {i18n.t("shell:engineGate.starting")}
          </p>
        </div>
      </div>
    </SpaceScreen>
  );
}
