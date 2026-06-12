/**
 * Gate that runs ABOVE EngineGate when VITE_HOUSTON_CLOUD_MODE=1.
 *
 * Robustness rules (the user lost in-flight OAuth dialogs to bouncy
 * remounting once already — don't again):
 *
 *  - The provisioned-user state and the cache live at module scope in
 *    lib/cloud-engine.ts (NOT useRef), so any React remount preserves
 *    them. Auth events re-fired on tab refocus become no-ops.
 *
 *  - cloud-engine.ts also installs the cached engine config on the
 *    singleton synchronously at module load, so EngineGate never shows
 *    its splash for a returning user.
 *
 *  - Children, once mounted, stay mounted. setPhase only flips OUT of
 *    'ready' on SIGNED_OUT — never on incidental auth events.
 *
 * When cloud mode is OFF, CloudGate is a pure pass-through.
 *
 * NOT i18n-enabled — sandbox feature, hardcoded English status copy.
 */

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import {
  clearProvisioned,
  ensureProvisioned,
  getProvisionedUserId,
  haveChildrenMounted,
  isCloudModeEnabled,
  isProvisionedFor,
  markChildrenMounted,
  resetMountedChildren,
} from "../../lib/cloud-engine";
import { logger } from "../../lib/logger";
import { CloudLoginScreen } from "./cloud-login-screen";

type Phase =
  | { kind: "boot" }
  | { kind: "needsLogin" }
  | { kind: "provisioning"; message: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function initialPhase(enabled: boolean): Phase {
  if (!enabled) return { kind: "ready" };
  const cachedUser = getProvisionedUserId();
  if (cachedUser && isProvisionedFor(cachedUser)) return { kind: "ready" };
  return { kind: "boot" };
}

export function CloudGate({ children }: { children: ReactNode }) {
  const enabled = isCloudModeEnabled();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(enabled));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function connectFor(userId: string) {
      if (isProvisionedFor(userId)) {
        logger.info(`[cloud-gate] short-circuit: ${userId} already provisioned`);
        return;
      }
      try {
        logger.info(`[cloud-gate] connectFor(${userId}) — provisioning`);
        setPhase({ kind: "provisioning", message: "Looking up your tenant..." });
        await ensureProvisioned(userId);
        if (cancelled) return;
        setPhase({ kind: "ready" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[cloud-gate] provisioning failed: ${msg}`);
        if (!cancelled) setPhase({ kind: "error", message: msg });
      }
    }

    async function bootstrap() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (cancelled) return;

        if (!session) {
          clearProvisioned();
          setPhase({ kind: "needsLogin" });
          return;
        }

        // Cached config was for a different user — clear before re-provisioning.
        const cachedUser = getProvisionedUserId();
        if (cachedUser && cachedUser !== session.user.id) {
          logger.info(
            `[cloud-gate] cache was for ${cachedUser}, session is ${session.user.id} — re-provisioning`,
          );
          clearProvisioned();
        }

        await connectFor(session.user.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[cloud-gate] bootstrap failed: ${msg}`);
        if (!cancelled) setPhase({ kind: "error", message: msg });
      }
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearProvisioned();
        resetMountedChildren();
        setPhase({ kind: "needsLogin" });
        return;
      }
      // SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED / USER_UPDATED.
      // connectFor short-circuits when the user already matches — App
      // stays mounted, OAuth dialogs survive.
      if (session?.user?.id) connectFor(session.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [enabled]);

  // Belt-and-suspenders: once children have rendered at least once during
  // this session, KEEP rendering them. Engine singleton stays put, so this
  // is safe — and it means no rogue phase flip can unmount App and eat an
  // in-progress dialog.
  if (phase.kind === "ready") {
    markChildrenMounted();
    return <>{children}</>;
  }
  if (haveChildrenMounted()) {
    logger.warn(
      `[cloud-gate] phase=${phase.kind} but children already mounted — keeping them rendered`,
    );
    return <>{children}</>;
  }
  if (phase.kind === "needsLogin") {
    // Hand the login screen an async handshake — its submit spinner stays
    // up until the engine singleton points at THIS user's tenant. Without
    // the await, children would mount with the new session but the old
    // engine token, and the first request would land 401 (which is what
    // ate the language-picker PUT). Every failure path surfaces — leaving
    // the user stuck on the spinner with no toast was the previous bug.
    const handleSignedIn = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session) {
          throw new Error("signed in but no session — please try again");
        }
        await ensureProvisioned(session.user.id);
        setPhase({ kind: "ready" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[cloud-gate] post-signin handshake failed: ${msg}`);
        setPhase({ kind: "error", message: msg });
      }
    };
    return <CloudLoginScreen onSignedIn={handleSignedIn} />;
  }
  if (phase.kind === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6 text-center">
        <p className="text-base font-semibold">Couldn't connect to your tenant.</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md break-words">
          {phase.message}
        </p>
        <button
          type="button"
          onClick={() => {
            clearProvisioned();
            window.location.reload();
          }}
          className="mt-4 text-sm underline text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }
  const text =
    phase.kind === "provisioning" ? phase.message : "Starting cloud session...";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground text-sm text-muted-foreground">
      {text}
    </div>
  );
}
