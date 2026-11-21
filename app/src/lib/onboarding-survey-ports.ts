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
      return null;
    }
  },
  writeLocal: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  fetchGateway: fetchGatewayOnboarding,
};
