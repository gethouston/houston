import i18n from "../../lib/i18n";
import { OrbitLoader } from "../space/orbit-loader";
import { SpaceScreen } from "../space/space-screen";

/**
 * Full-screen boot splash: the {@link OrbitLoader} — a small ship orbiting a
 * soft pulsing core, trailing a comet streak — centred directly on the shared
 * space backdrop, with a status line below it. No card: the content sits on the
 * dark space canvas and uses the space-foreground token family (same as the
 * sign-in wordmark/footer), so the boot experience reads as one continuous
 * space rather than a bright box floating in it.
 *
 * One component covers every boot blocker — the engine handshake (EngineGate,
 * desktop + web), the auth-session resolve, and the first workspace/agent load
 * (App.tsx) — so the whole startup reads as a single continuous loading state.
 *
 * Renders on the shared {@link SpaceScreen} space backdrop (WebGL nebula +
 * starfield), same as the sign-in screen.
 *
 * Reads the i18n singleton directly (not useTranslation): the web EngineGate
 * renders this OUTSIDE <I18nextProvider>, and at gate time the saved language
 * isn't applied yet anyway (LanguageGate mounts after the engine is ready).
 */
export function WorkspaceLoading() {
  return (
    <SpaceScreen>
      <div className="flex flex-1 items-center justify-center px-6">
        <div
          role="status"
          className="flex flex-col items-center gap-6 text-[var(--ht-space-foreground)]"
        >
          <OrbitLoader />
          <p className="text-sm text-[var(--ht-space-foreground-muted)]">
            {i18n.t("shell:engineGate.starting")}
          </p>
        </div>
      </div>
    </SpaceScreen>
  );
}
