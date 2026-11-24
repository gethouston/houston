import * as Sentry from "@sentry/browser";
import { nativeTelemetryTag } from "./native-telemetry";
import { confirmDelivery, recordDelivery } from "./sentry-delivery";
import { currentClientDeployment } from "./sentry-deployment";
import { sentrySendInDevEnabled } from "./sentry-dev";
import { eventIdFromEnvelope, isAcceptedStatus } from "./sentry-transport";

const DSN = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";

const SEND_IN_DEV = sentrySendInDevEnabled(
  typeof __SENTRY_SEND_IN_DEV__ !== "undefined" ? __SENTRY_SEND_IN_DEV__ : "",
);

export const sentrySuppressedInDev = import.meta.env.DEV && !SEND_IN_DEV;

const RELEASE = `houston-app@${
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0"
}`;

let initialized = false;

function resolveEnvironment(): string {
  const injected =
    typeof window !== "undefined" ? window.__HOUSTON_DEPLOY_ENV__ : undefined;
  if (injected) return injected;
  return import.meta.env.DEV ? "development" : "production";
}

export function initSentry(): void {
  if (initialized || !DSN || sentrySuppressedInDev) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    release: RELEASE,
    environment: resolveEnvironment(),
    sendDefaultPii: false,
    transport: (options) => {
      const inner = Sentry.makeFetchTransport(options);
      return {
        send: async (envelope) => {
          const eventId = eventIdFromEnvelope(envelope);
          try {
            const response = await inner.send(envelope);
            if (eventId) {
              recordDelivery(eventId, isAcceptedStatus(response?.statusCode));
            }
            return response;
          } catch (err) {
            if (eventId) recordDelivery(eventId, false);
            throw err;
          }
        },
        flush: (timeout) => inner.flush(timeout),
      };
    },
    integrations: (defaultIntegrations) => [
      ...defaultIntegrations.filter(
        (integration) =>
          integration.name !== "BrowserSession" &&
          integration.name !== "GlobalHandlers",
      ),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  Sentry.setTag("deployment", currentClientDeployment());
  const { surface } = nativeTelemetryTag();
  if (surface) Sentry.setTag("surface", surface);
}

export async function captureException(
  error: unknown,
  context?: Record<string, string>,
  extra?: Record<string, unknown>,
  fingerprint?: string[],
): Promise<string> {
  if (!initialized) return "";
  const normalized = error instanceof Error ? error : new Error(String(error));
  const eventId = Sentry.captureException(
    normalized,
    context || extra || fingerprint
      ? { tags: context, extra, fingerprint }
      : undefined,
  );
  return confirmDelivery(eventId);
}

export function setUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): void {
  if (!initialized) return;
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
    username: user.name ?? undefined,
  });
}

export function clearUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}
