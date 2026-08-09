// The live wiring of `./onboarding-survey-store`'s ports: the engine
// preference store, the browser's localStorage mirror, and the gateway read.
// Kept apart from the store itself so the store's durability rules stay
// importable (and testable) without the Tauri/engine surface.

import type { SurveyStorePorts } from "./onboarding-survey-store.ts";
import { fetchGatewayOnboarding } from "./onboarding-sync.ts";
import { tauriPreferences } from "./tauri";

export const liveSurveyStorePorts: SurveyStorePorts = {
  getPreference: (key) => tauriPreferences.get(key),
  setPreference: (key, value) => tauriPreferences.set(key, value),
  readLocal: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; /* disabled storage — the engine pref still carries it */
    }
  },
  writeLocal: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota / disabled storage — the engine pref still carries the answer */
    }
  },
  fetchGateway: fetchGatewayOnboarding,
};
