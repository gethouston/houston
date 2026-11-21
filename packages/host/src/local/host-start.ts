import { trackBoundAgentRole } from "../agent-role/role-publisher";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { warmViewDocs } from "../docs/view-warm";
import { formatAssistantModeLog } from "../routes/assistant-wiring";
import { sendBootReport } from "../telemetry/boot-report";
import { formatHostListeningBanner } from "./banner";
import { formatIntegrationsModeLog, severityLog } from "./host-log";
import { runHostMigrations } from "./host-migrations";
import type { LocalHostOptions } from "./host-options";
import type { LocalHostState } from "./host-state";

export async function startLocalHost(
  opts: LocalHostOptions,
  state: LocalHostState,
) {
  const {
    boot,
    syncDaemon,
    server,
    docProjector,
    docShadow,
    roleTracker,
    store,
    watcher,
    scheduler,
    usageSampler,
    heartbeatDaemon,
    assistantWiring,
    launcher,
  } = state;

  const bootStamp = (phase: string) =>
    console.log(
      `[local-host] boot: ${phase} at +${process.uptime().toFixed(1)}s`,
    );
  bootStamp("module eval done");
  boot.record("module_eval", process.uptime() * 1000);
  if (syncDaemon) {
    const objects = await boot.time("hydrate", () => syncDaemon.hydrate());
    boot.setHydratedObjects(objects);
  }
  await state.uploadSessions?.sweep();
  await runHostMigrations(opts, state);
  bootStamp("hydration + migrations done");
  const bind = opts.bind ?? "127.0.0.1";
  await boot.time(
    "listen",
    () =>
      new Promise<void>((resolve) =>
        server.listen(opts.port, bind, () => resolve()),
      ),
  );
  if (!opts.passive) {
    docProjector?.seed();
    if (docProjector) trackBoundAgentRole(roleTracker, docProjector);
    if (docShadow) {
      warmViewDocs({ port: opts.port, token: opts.token, store });
    }
    watcher.start();
    syncDaemon?.start();
    scheduler.start();
    heartbeatDaemon?.start();
    usageSampler?.start();
  }
  console.log(formatIntegrationsModeLog(opts.integrations));
  console.log(formatAssistantModeLog(assistantWiring));
  processAssistantCatalog();
  console.log(
    formatHostListeningBanner({
      port: opts.port,
      token: opts.token,
      redactToken: opts.redactBannerToken ?? false,
    }),
  );
  boot.markReady();
  const reportBoot = () => {
    if (!opts.usageReporting) return;
    void sendBootReport({
      report: opts.usageReporting,
      telemetry: boot,
      log: severityLog,
    });
  };
  if (opts.eagerRuntime) {
    void (async () => {
      const spawnT0 = Date.now();
      for (const ws of await store.listWorkspaces()) {
        for (const agent of await store.listAgents(ws.id)) {
          await launcher.ensureAwake(agent).catch((err) => {
            console.error(
              `[local-host] eager runtime spawn failed for ${agent.id} (continuing):`,
              err,
            );
          });
        }
      }
      boot.record("runtime_spawn", Date.now() - spawnT0);
      reportBoot();
    })();
  } else {
    reportBoot();
  }
}
