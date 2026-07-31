import { Spinner } from "@houston-ai/core";
import { motion, type Transition, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import i18n from "../../lib/i18n";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";

/** Motion tokens: `easing.entrance` + `duration.elegant` (582ms). The boot
 *  splash is a designated elegant moment, so it earns the long ease-out. */
const ENTRANCE: Transition = { duration: 0.582, ease: [0.16, 1, 0.3, 1] };

/** The splash mounts at several gate positions during one boot (engine
 *  handshake → session → workspace load). The entrance plays once per page
 *  load; later mounts render settled so the boot reads as ONE surface. */
let entrancePlayed = false;

/**
 * Full-screen boot splash: the standard screen surface (`bg-background` +
 * `.canvas-screen`, so it is the light Aurora screen tone in light and the
 * frosted glass over the gutter in dark) with a spinner and a status line
 * centred on it. Deliberately minimal: the app opens onto the same surface it
 * will keep, so booting reads as the screen settling rather than a separate
 * splash handing over to the workspace.
 *
 * One component covers every boot blocker — the engine handshake (EngineGate,
 * desktop + web), the auth-session resolve, and the first workspace/agent load
 * (App.tsx) — so the whole startup reads as a single continuous loading state.
 *
 * Reads the i18n singleton directly (not useTranslation): the web EngineGate
 * renders this OUTSIDE <I18nextProvider>, and at gate time the saved language
 * isn't applied yet anyway (LanguageGate mounts after the engine is ready).
 */
export function WorkspaceLoading() {
  const reduce = useReducedMotion() ?? false;
  const playEntrance = !entrancePlayed;
  useEffect(() => {
    entrancePlayed = true;
  }, []);

  return (
    <div className="canvas-screen fixed inset-0 flex flex-col bg-background">
      {/* macOS titleBarStyle: Overlay draws no native bar, so without a drag
          region the window can't be moved from a full-screen gate surface.
          Same strip as the workspace shell's, floated over the top edge so the
          splash layout doesn't shift; the content stays below 28px. Gated like
          the shell's: only the macOS desktop build uses the overlay title bar. */}
      {osIsTauri() && isMac && (
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-20 h-7"
        />
      )}
      <div className="flex flex-1 items-center justify-center px-6">
        <motion.div
          role="status"
          className="flex flex-col items-center gap-4"
          initial={
            playEntrance
              ? reduce
                ? { opacity: 0 }
                : { opacity: 0, y: 8 }
              : false
          }
          animate={{ opacity: 1, y: 0 }}
          transition={ENTRANCE}
        >
          <Spinner
            aria-hidden="true"
            className="size-5 text-ink-muted motion-reduce:animate-none"
          />
          <p className="text-sm text-ink-muted">
            {i18n.t("shell:engineGate.starting")}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
