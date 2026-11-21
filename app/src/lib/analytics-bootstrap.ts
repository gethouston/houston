import posthog from "posthog-js";
import { nativeTelemetryTag } from "./native-telemetry";
import { currentPlatformOs } from "./platform";

export const ANALYTICS_KEY =
  typeof __POSTHOG_KEY__ !== "undefined" ? __POSTHOG_KEY__ : "";
const HOST =
  typeof __POSTHOG_HOST__ !== "undefined" && __POSTHOG_HOST__
    ? __POSTHOG_HOST__
    : "https://us.i.posthog.com";
export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export const ANALYTICS_SESSION_ID = crypto.randomUUID();

function rawNavigatorPlatform() {
  return typeof navigator !== "undefined" ? navigator.platform : "unknown";
}

export function baseSuperProps() {
  const deployEnv =
    typeof window !== "undefined" ? window.__HOUSTON_DEPLOY_ENV__ : undefined;
  return {
    app_version: APP_VERSION,
    app_os: currentPlatformOs,
    os: rawNavigatorPlatform(),
    is_debug: import.meta.env.DEV,
    session_id: ANALYTICS_SESSION_ID,
    ...(deployEnv ? { environment: deployEnv } : {}),
    ...nativeTelemetryTag(),
  };
}

let bootstrapped = false;

function bootstrap() {
  if (bootstrapped || !ANALYTICS_KEY) return;
  bootstrapped = true;
  posthog.init(ANALYTICS_KEY, {
    api_host: HOST,
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_dead_clicks: true,
    rageclick: true,
    disable_session_recording: false,
    enable_heatmaps: true,
    loaded: (ph) => {
      ph.register({
        ...baseSuperProps(),
        auth_status: "anonymous",
      });
    },
  });
}
bootstrap();
