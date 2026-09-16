import { useEffect, useRef } from "react";
import {
  applySettingsLanding,
  captureSettingsLanding,
  type SettingsLanding,
} from "../lib/settings-landing";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useSession } from "./use-session";

/**
 * Apply a public link once the app can act on it. The ticket is captured and
 * stripped from the URL on mount, before the wait for sign-in and workspace
 * loading — it lives in memory from then on, never in the address bar.
 */
export function useSettingsLanding() {
  const pending = useRef<SettingsLanding>({ kind: "absent" });
  const captured = useRef(false);
  const { data: session } = useSession();
  const space = useWorkspaceStore((s) => s.current);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    // The nav stack owns navigation; this rewrites only the query of the entry
    // already on screen, passing its state through, so the stack's index
    // survives and no entry is pushed or dropped.
    pending.current = captureSettingsLanding(window.location.href, (url) =>
      window.history.replaceState(window.history.state, "", url),
    );
  }, []);
  useEffect(() => {
    if (pending.current.kind === "absent" || !session || !space) return;
    const landing = pending.current;
    pending.current = { kind: "absent" };
    applySettingsLanding(landing, {
      open: (section) => useUIStore.getState().openSettings(section),
      hand: (completion) =>
        useUIStore.getState().setPendingSlackCompletion(completion),
    });
  }, [session, space]);
}
