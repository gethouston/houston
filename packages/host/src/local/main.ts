import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  initEngineSentry,
  installConsoleCapture,
} from "@houston/runtime-client/sentry";

import { buildMainHost } from "./main-host";
import {
  installProcessErrorHandlers,
  installShutdownHandlers,
} from "./main-lifecycle";
import { managedStoreConfig } from "./managed-store-config";

const sentry = initEngineSentry("host");
if (sentry) installConsoleCapture(sentry);
console.info(
  sentry
    ? "[local-host] crash reporting: on (Sentry)"
    : process.env.SENTRY_DSN
      ? "[local-host] crash reporting: off (dev run; set SENTRY_SEND_IN_DEV=1 to send)"
      : "[local-host] crash reporting: off (no SENTRY_DSN)",
);

async function fatal(...message: unknown[]): Promise<never> {
  console.error(...message);
  await sentry?.flush();
  process.exit(1);
}

async function remoteCredentialConfig(hostTokenEnv: string | undefined) {
  const url = process.env.HOUSTON_CREDENTIALS_URL;
  const orgSlug = process.env.HOUSTON_ORG_SLUG;
  const agentSlug = process.env.HOUSTON_AGENT_SLUG;
  if (url && orgSlug && agentSlug && hostTokenEnv) {
    return { url, orgSlug, agentSlug, podToken: hostTokenEnv };
  }
  if (url || (!process.env.HOUSTON_STORE_URL && (orgSlug || agentSlug))) {
    return fatal(
      "[local-host] incomplete managed credential gateway env: set HOUSTON_CREDENTIALS_URL, HOUSTON_ORG_SLUG, HOUSTON_AGENT_SLUG, and HOUSTON_HOST_TOKEN together.",
    );
  }
  return undefined;
}

const houstonHome = process.env.HOUSTON_HOME || join(homedir(), ".houston");
const hostTokenEnv = process.env.HOUSTON_HOST_TOKEN;
const hostToken = hostTokenEnv || randomBytes(32).toString("hex");
const remoteGateway = await remoteCredentialConfig(hostTokenEnv);
const managedStore = await managedStoreConfig(
  hostTokenEnv,
  houstonHome,
  (message) => fatal(message),
);
const triggersEnabled = process.env.HOUSTON_MANAGED_CLOUD === "1";
const routineSchedulerModeRaw =
  process.env.HOUSTON_ROUTINE_SCHEDULER_MODE || undefined;
const routineSchedulerMode =
  routineSchedulerModeRaw === undefined || routineSchedulerModeRaw === "local"
    ? "local"
    : routineSchedulerModeRaw === "external"
      ? "external"
      : await fatal(
          `[local-host] invalid HOUSTON_ROUTINE_SCHEDULER_MODE=${routineSchedulerModeRaw}; expected local or external.`,
        );
if (routineSchedulerMode === "external" && !triggersEnabled) {
  await fatal(
    "[local-host] HOUSTON_ROUTINE_SCHEDULER_MODE=external is valid only on managed cloud pods.",
  );
}
const durableTurns = managedStore?.podGateway
  ? (() => {
      const transcriptDualWrite =
        process.env.HOUSTON_TRANSCRIPT_DUAL_WRITE === "1";
      const turnLog = process.env.HOUSTON_TURN_LOG === "1";
      console.info(
        transcriptDualWrite
          ? "[boot] transcript dual-write ON (HOUSTON_TRANSCRIPT_DUAL_WRITE=1)"
          : "[boot] transcript dual-write OFF (HOUSTON_TRANSCRIPT_DUAL_WRITE unset)",
      );
      console.info(
        turnLog
          ? "[boot] turnlog capture ON (HOUSTON_TURN_LOG=1)"
          : "[boot] turnlog capture OFF (HOUSTON_TURN_LOG unset)",
      );
      return {
        gateway: managedStore.podGateway,
        turnlogGateway: process.env.HOUSTON_TURNLOG_URL
          ? {
              ...managedStore.podGateway,
              baseUrl: process.env.HOUSTON_TURNLOG_URL,
              fence: { ...managedStore.podGateway.fence },
            }
          : undefined,
        transcriptDualWrite,
        turnLog,
      };
    })()
  : undefined;
const host = buildMainHost({
  houstonHome,
  hostTokenEnv,
  hostToken,
  remoteGateway,
  managedStore,
  durableTurns,
  triggersEnabled,
  routineSchedulerMode,
  flushReports: async () => {
    await sentry?.flush(500);
  },
});

installProcessErrorHandlers();

try {
  await host.start();
} catch (err) {
  await fatal("[local-host] startup failed:", err);
}

installShutdownHandlers(host, sentry);
