/**
 * Where client product events land: the gateway's `/v1/analytics/events`
 * ingest. This file is only the wiring — the live gateway target, this
 * launch's device identity, and the app's one reporting path — bolted onto the
 * injected policy in `post.ts`, which is where the delivery rules live.
 */

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

/** This launch's device identity; the policy behind it is in `context.ts`. */
const productAnalyticsContext = createProductAnalyticsContext({
  sessionId: analyticsSessionId,
  appVersion: APP_VERSION,
  platform: () => (osIsTauri() ? "desktop" : "web"),
  readInstallId: createInstallIdReader({
    whenEngineReady,
    readStoredId: async () => (await getInstallId()).id,
  }),
  // Desktop has no link to land on, so it never even looks: reading the id
  // there would only reach a `window.location` that no website ever wrote.
  readVisitorId: () => (osIsTauri() ? null : readWebVisitorId()),
});

/** POSTs one batch. Resolves for every expected outcome; see `post.ts`. */
export const sendProductEvents = createProductEventsPost({
  gateway: liveGatewayDeps,
  context: productAnalyticsContext,
  send: gatewayFetch,
  isOffline: isNetworkTransportError,
  report: (message, detail) =>
    reportError("product-analytics", message, detail),
});
