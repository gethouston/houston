/**
 * Booting PostHog, and the super properties every event carries.
 *
 * Imported for its SIDE EFFECT as much as its exports: the SDK is initialised
 * at module load, so a configured build can capture errors before
 * `analytics.init()` resolves. Product events are fired after init.
 */

import posthog from "posthog-js";
import { currentPlatformOs } from "./platform";

// __POSTHOG_KEY__, __POSTHOG_HOST__, __APP_VERSION__ declared in vite-env.d.ts,
// baked at build time by Vite from POSTHOG_KEY / POSTHOG_HOST env vars.
/** Empty on a build with no secrets: the whole pipe is then a silent no-op. */
export const ANALYTICS_KEY =
  typeof __POSTHOG_KEY__ !== "undefined" ? __POSTHOG_KEY__ : "";
const HOST =
  typeof __POSTHOG_HOST__ !== "undefined" && __POSTHOG_HOST__
    ? __POSTHOG_HOST__
    : "https://us.i.posthog.com";
export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// Per-process session id. Regenerated every app launch — lets us group
// events that happened in the same "sit-down session" without making
// users a tracking surface.
export const ANALYTICS_SESSION_ID = crypto.randomUUID();

function rawNavigatorPlatform() {
  return typeof navigator !== "undefined" ? navigator.platform : "unknown";
}

/** The properties stamped on every event, re-registered after every reset. */
export function baseSuperProps() {
  // The web entry injects the runtime deploy environment on
  // `window.__HOUSTON_DEPLOY_ENV__` (production / preview / development, derived
  // from the hostname of the ONE promoted bundle). Attach it as a super property
  // so preview traffic is filterable out of product metrics. Unset on the
  // desktop, where `is_debug` already separates dev from release.
  const deployEnv =
    typeof window !== "undefined" ? window.__HOUSTON_DEPLOY_ENV__ : undefined;
  return {
    app_version: APP_VERSION,
    app_os: currentPlatformOs,
    os: rawNavigatorPlatform(),
    is_debug: import.meta.env.DEV,
    session_id: ANALYTICS_SESSION_ID,
    ...(deployEnv ? { environment: deployEnv } : {}),
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
    // Friction signals ($rageclick / $dead_click) require autocapture. Masking
    // keeps user content (agent names, email subjects, chat text) out of
    // PostHog — only element selectors/positions leave the app. Specific
    // question behind enabling (production-infra.md): where does the v0.5.9
    // onboarding strand users?
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_dead_clicks: true,
    rageclick: true,
    // Recordings + heatmaps (user-approved 2026-07-16) answer the open
    // production-infra.md question: where does onboarding strand users?
    // Both ride the SAME masking as autocapture above — recordings capture
    // the masked DOM (all text as asterisks), heatmaps only element
    // selectors/positions — so user content still never leaves the app.
    // The PostHog project toggles (session_recording_opt_in /
    // heatmaps_opt_in) must be ON too; either side alone captures nothing.
    //
    // Do NOT set `advanced_disable_flags` here. The web recorder does not
    // start from local config alone: it waits for the remote `/flags`
    // response, which carries the `sessionRecording` block (endpoint, sample
    // rate, masking). Suppressing that request means the recorder never
    // initializes, `recorder.js` is never fetched, and not a single
    // `$snapshot` is emitted — replay looks enabled on both sides yet
    // captures nothing, silently. That flag shipped alongside replay in
    // 0.5.18+ and is why this project has zero recordings.
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
