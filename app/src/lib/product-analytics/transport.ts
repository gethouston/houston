import { analyticsSessionId } from "../analytics";
import { whenEngineReady } from "../engine";
import { reportError } from "../error-report";
import { gatewayFetch, liveGatewayDeps } from "../gateway-fetch.ts";
import { getInstallId } from "../install-id";
import { isNetworkTransportError } from "../network-transport-error.ts";
import { osIsTauri } from "../os-bridge";
import { readWebVisitorId } from "../web-visitor-landing.ts";
import {
  createInstallIdReader,
  createProductAnalyticsContext,
} from "./context.ts";
import { createProductEventsPost } from "./post.ts";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const productAnalyticsContext = createProductAnalyticsContext({
  sessionId: analyticsSessionId,
  appVersion: APP_VERSION,
  platform: () => (osIsTauri() ? "desktop" : "web"),
  readInstallId: createInstallIdReader({
    whenEngineReady,
    readStoredId: async () => (await getInstallId()).id,
  }),
  readVisitorId: () => (osIsTauri() ? null : readWebVisitorId()),
});

export const sendProductEvents = createProductEventsPost({
  gateway: liveGatewayDeps,
  context: productAnalyticsContext,
  send: gatewayFetch,
  isOffline: isNetworkTransportError,
  report: (message, detail) =>
    reportError("product-analytics", message, detail),
});
