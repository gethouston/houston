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
    store,
    watcher,
    scheduler,
    usageSampler,
    assistantWiring,
    launcher,
  } = state;

  // Boot-phase stamps attribute managed-pod wake latency. The first stamp
  // exposes module-evaluation cost; the listening banner closes the ledger.
  const bootStamp = (phase: string) =>
    console.log(
      `[local-host] boot: ${phase} at +${process.uptime().toFixed(1)}s`,
    );
  bootStamp("module eval done");
  boot.record("module_eval", process.uptime() * 1000);
  // The object store is authoritative in managed server mode. Hydration is
  // readiness-critical and must finish before migrations or HTTP listening;
  // failure propagates so the pod restarts without ever syncing an empty tree.
  if (syncDaemon) {
    const objects = await boot.time("hydrate", () => syncDaemon.hydrate());
    boot.setHydratedObjects(objects);
  }
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
  // Passive migration-source mode runs no background daemons (a read-only
  // source must not fire routines, sync, or churn watch events).
  if (!opts.passive) {
    // Seed the doc shadow at boot (revisions + one content projection),
    // never blocking readiness. Inside the passive gate: the seed now
    // WRITES docs, and a passive migration-source host pushing its old
    // tree's families over the live agent's docs is exactly the
    // stale-data overwrite passivity exists to prevent.
    docProjector?.seed();
    if (docShadow) {
      // Self-warm the view docs so an agent asleep since before views
      // existed gets them published without a first slow client read.
      warmViewDocs({ port: opts.port, token: opts.token, store });
    }
    watcher.start();
    syncDaemon?.start();
    scheduler.start();
    usageSampler?.start();
  }
  console.log(formatIntegrationsModeLog(opts.integrations));
  // The assistant dispatcher's one boot line: its gateway, this host
  // itself, or off naming the env it still needs.
  console.log(formatAssistantModeLog(assistantWiring));
  // Read the operation catalog HERE so a deployment that packaged none says
  // so in the startup log rather than in the first unlucky agent request.
  processAssistantCatalog();
  // The banner the Tauri supervisor parses (mirrors the runtime's contract).
  // The full token rides ONLY for the desktop sidecar; a pod/self-host token
  // is env-supplied and redacted so it never lands in plaintext logs.
  console.log(
    formatHostListeningBanner({
      port: opts.port,
      token: opts.token,
      redactToken: opts.redactBannerToken ?? false,
    }),
  );
  boot.markReady();
  // One-shot boot report to the gateway (HOU-1011): pods scale to zero, so
  // Prometheus can't scrape a boot — push the ledger instead. Same gateway
  // quadruple as usage reporting; absent on desktop/self-host = no report.
  const reportBoot = () => {
    if (!opts.usageReporting) return;
    void sendBootReport({
      report: opts.usageReporting,
      telemetry: boot,
      log: severityLog,
    });
  };
  if (opts.eagerRuntime) {
    // Fire-and-forget AFTER the banner: /health (and the supervisor)
    // must never wait on a runtime boot — the point is overlap, and a
    // runtime that fails here heals exactly like it always has (the
    // next dispatch retries the spawn). Sequential on purpose: a pod
    // hosts one agent, and a multi-agent tree shouldn't stampede the
    // CPU it shares with the boot it is overlapping.
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
      // The report waits for the spawn on purpose: it's the slowest boot
      // step (~10s) and the whole point of the ledger (HOU-867).
      boot.record("runtime_spawn", Date.now() - spawnT0);
      reportBoot();
    })();
  } else {
    reportBoot();
  }
}
