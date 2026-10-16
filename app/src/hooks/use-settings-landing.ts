import type { Capabilities } from "@houston/engine-adapter";
import { useEffect, useRef, useState } from "react";
import { reportError } from "../lib/error-report";
import { listenDeepLink } from "../lib/identity/deep-link-listen";
import { osCurrentDeepLinks } from "../lib/os-bridge";
import {
  ackBootLanding,
  applySettingsLanding,
  peekBootLanding,
  type SettingsLanding,
  settingsLandingFromDeepLink,
} from "../lib/settings-landing";
import {
  createHandedLinks,
  createLandingGate,
} from "../lib/settings-link-gate";
import {
  type SettingsSectionId,
  settingsLandingSection,
  settingsSectionFromDeepLink,
  settingsSectionFromPath,
} from "../lib/settings-sections";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useSession } from "./use-session";

/** Open a linked section, or the index where this deployment does not serve it. */
function land(
  section: SettingsSectionId,
  capabilities: Capabilities | null,
): void {
  useUIStore
    .getState()
    .openSettings(settingsLandingSection(section, capabilities));
}

function applyLanding(
  landing: SettingsLanding,
  capabilities: Capabilities | null,
): void {
  applySettingsLanding(landing, {
    open: (section) => land(section, capabilities),
    hand: (completion) =>
      useUIStore.getState().setPendingSlackCompletion(completion),
    linkedIn: (completion) =>
      useUIStore.getState().setPendingLinkedInCompletion(completion),
  });
}

function landPending(
  path: { current: SettingsSectionId | null },
  capabilities: Capabilities | null,
): void {
  if (!path.current) return;
  land(path.current, capabilities);
  path.current = null;
}

const HANDED_LINKS_KEY = "houston.settings-links-handed";

/** Outlives every mount: the shell remounts on sign-out and migration. */
const handedLinks = createHandedLinks(
  {
    read: () => window.sessionStorage.getItem(HANDED_LINKS_KEY),
    write: (value) => window.sessionStorage.setItem(HANDED_LINKS_KEY, value),
  },
  (error) =>
    reportError(
      "settings_link_ledger",
      "Could not remember a handed settings link",
      error,
    ),
);

/**
 * Apply a public link once the app can act on it. The web entry captured the
 * landing and stripped it from the URL at boot, before analytics started
 * (`captureBootLanding`); this reads it from memory on mount, then waits
 * for sign-in and workspace loading. A
 * section also waits for the deployment's capabilities, so a Billing link where
 * the plan is not served lands on the Settings index, never a blank screen.
 * The OS deep link is re-read on every mount, which rescues one that arrived
 * while signed out; the gate drops one already handed over.
 */
export function useSettingsLanding() {
  const pendingPath = useRef<SettingsSectionId | null>(null);
  const ready = useRef(false);
  const captured = useRef(false);
  const { data: session } = useSession();
  const space = useWorkspaceStore((s) => s.current);
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  ready.current = Boolean(session && space) && !capabilitiesLoading;
  const [gate] = useState(() =>
    createLandingGate({
      isReady: () => ready.current,
      apply: (landing) => applyLanding(landing, capabilitiesRef.current),
      handed: handedLinks,
      report: (error) =>
        reportError("settings_landing", "Could not apply settings link", error),
    }),
  );
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    // The nav stack owns navigation; this rewrites only the query of the entry
    // already on screen, passing its state through, so the stack's index
    // survives and no entry is pushed or dropped.
    void gate.offer({
      landing: peekBootLanding(window.location.href, (url) =>
        window.history.replaceState(window.history.state, "", url),
      ),
      link: null,
      // Held until applied, so a remount before sign-in still has it.
      applied: ackBootLanding,
    });
    pendingPath.current = settingsSectionFromPath(window.location.pathname);
    void osCurrentDeepLinks()
      .then((links) => {
        for (const link of links) {
          const section = settingsSectionFromDeepLink(link);
          if (section) pendingPath.current = section;
        }
        if (ready.current) landPending(pendingPath, capabilitiesRef.current);
        for (const link of links)
          void gate.offer({ landing: settingsLandingFromDeepLink(link), link });
      })
      .catch((error: unknown) =>
        reportError(
          "settings_initial_link",
          "Could not read initial settings link",
          error,
        ),
      );
  }, [gate]);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenDeepLink((value) => {
      const section = settingsSectionFromDeepLink(value);
      if (section) {
        if (ready.current) land(section, capabilitiesRef.current);
        else pendingPath.current = section;
      }
      void gate.offer({
        landing: settingsLandingFromDeepLink(value),
        link: value,
      });
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) =>
        reportError(
          "settings_deep_link",
          "Could not listen for settings link",
          error,
        ),
      );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [gate]);
  useEffect(() => {
    if (!session || !space || capabilitiesLoading) return;
    landPending(pendingPath, capabilitiesRef.current);
    void gate.flush();
  }, [session, space, capabilitiesLoading, gate]);
}
