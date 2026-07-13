import { type ReactNode, useEffect, useRef } from "react";
import { useCloudMigration } from "../../../hooks/use-cloud-migration";
import { analytics } from "../../../lib/analytics";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { ClaudeBrowserLogin } from "../../shell/claude-browser-login";
import { ProviderLoginFallback } from "../../shell/provider-login-fallback";
import { WorkspaceLoading } from "../../shell/workspace-loading";
import { SpaceScreen } from "../../space/space-screen";
import { DoneScreen } from "./done-screen";
import { OfferScreen } from "./offer-screen";
import { ProgressScreen } from "./progress-screen";

/**
 * First-run cloud-migration gate (HOU-719). Mounted in App.tsx AFTER the
 * session/auth gates and BEFORE the firstRun onboarding branch — a migrating
 * user has zero cloud agents and would otherwise be captured by the
 * create-your-assistant flow. Renders children whenever the trigger says no
 * (see `hooks/cloud-migration-trigger.ts` for the full gate).
 */
export function CloudMigrationGate({ children }: { children: ReactNode }) {
  const trigger = useCloudMigration();

  const offered = useRef(false);
  useEffect(() => {
    if (trigger.status !== "show" || offered.current) return;
    offered.current = true;
    analytics.track("cloud_migration_offered", {
      agent_count: trigger.detection?.agentDirCount ?? 0,
      workspace_count: trigger.detection?.workspaceDirs.length ?? 0,
    });
  }, [trigger.status, trigger.detection]);

  if (trigger.status === "loading") return <WorkspaceLoading />;
  if (trigger.status !== "show" || !trigger.detection) return <>{children}</>;
  return (
    <>
      {/* The done screen's provider reconnect needs the login handlers the
          shell normally mounts (browser OAuth / device-code dialogs). */}
      <ProviderLoginFallback />
      <ClaudeBrowserLogin />
      <CloudMigrationWizard
        detection={trigger.detection}
        persistOutcome={trigger.persistOutcome}
      />
    </>
  );
}

function CloudMigrationWizard({
  detection,
  persistOutcome,
}: {
  detection: LegacyDetection;
  persistOutcome: (
    outcome: "done" | "skipped",
    opts?: { applyNow?: boolean },
  ) => void;
}) {
  const screen = useCloudMigrationStore((s) => s.screen);
  const start = useCloudMigrationStore((s) => s.start);
  const deferMigration = useCloudMigrationStore((s) => s.deferMigration);

  // One SpaceScreen wrapping every wizard screen (like onboarding) so the
  // backdrop photo mounts once and never re-fades across offer → progress →
  // done transitions.
  return (
    <SpaceScreen>
      {screen === "offer" ? (
        <OfferScreen
          detection={detection}
          onStart={() => start()}
          onSkip={() => {
            analytics.track("cloud_migration_skipped", {
              agent_count: detection.agentDirCount,
            });
            persistOutcome("skipped");
          }}
        />
      ) : screen === "progress" ? (
        <ProgressScreen
          onDefer={() => {
            deferMigration();
            analytics.track("cloud_migration_deferred", {
              agent_count: detection.agentDirCount,
            });
            persistOutcome("skipped");
          }}
        />
      ) : (
        <DoneScreen persistOutcome={persistOutcome} />
      )}
    </SpaceScreen>
  );
}
