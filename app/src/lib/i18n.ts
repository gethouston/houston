/**
 * i18next setup for the Houston desktop app.
 *
 * Source of truth for the user's locale = engine preference `locale`.
 * localStorage is only a boot-time cache so the first paint doesn't flash
 * English before the engine preference is read.
 *
 * Supported UI locales: en (filled), es (stub), pt (stub). Fallback = en.
 */

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import agentsEn from "../locales/en/agents.json";
import boardEn from "../locales/en/board.json";
import chatEn from "../locales/en/chat.json";
import commonEn from "../locales/en/common.json";
import contextEn from "../locales/en/context.json";
import dashboardEn from "../locales/en/dashboard.json";
import errorsEn from "../locales/en/errors.json";
import eventsEn from "../locales/en/events.json";
import legalEn from "../locales/en/legal.json";
import portableEn from "../locales/en/portable.json";
import providersEn from "../locales/en/providers.json";
import routinesEn from "../locales/en/routines.json";
import settingsEn from "../locales/en/settings.json";
import setupEn from "../locales/en/setup.json";
import shellEn from "../locales/en/shell.json";
import skillsEn from "../locales/en/skills.json";
import agentsEs from "../locales/es/agents.json";
import boardEs from "../locales/es/board.json";
import chatEs from "../locales/es/chat.json";
import commonEs from "../locales/es/common.json";
import contextEs from "../locales/es/context.json";
import dashboardEs from "../locales/es/dashboard.json";
import errorsEs from "../locales/es/errors.json";
import eventsEs from "../locales/es/events.json";
import legalEs from "../locales/es/legal.json";
import portableEs from "../locales/es/portable.json";
import providersEs from "../locales/es/providers.json";
import routinesEs from "../locales/es/routines.json";
import settingsEs from "../locales/es/settings.json";
import setupEs from "../locales/es/setup.json";
import shellEs from "../locales/es/shell.json";
import skillsEs from "../locales/es/skills.json";
import agentsPt from "../locales/pt/agents.json";
import boardPt from "../locales/pt/board.json";
import chatPt from "../locales/pt/chat.json";
import commonPt from "../locales/pt/common.json";
import contextPt from "../locales/pt/context.json";
import dashboardPt from "../locales/pt/dashboard.json";
import errorsPt from "../locales/pt/errors.json";
import eventsPt from "../locales/pt/events.json";
import legalPt from "../locales/pt/legal.json";
import portablePt from "../locales/pt/portable.json";
import providersPt from "../locales/pt/providers.json";
import routinesPt from "../locales/pt/routines.json";
import settingsPt from "../locales/pt/settings.json";
import setupPt from "../locales/pt/setup.json";
import shellPt from "../locales/pt/shell.json";
import skillsPt from "../locales/pt/skills.json";
import {
  activeWorkspaceLocale,
  isSupported,
  LOCALE_PREF_KEY,
  localeGateIsLoading,
  localeToApply,
  normalizeLocale,
  resolveEffectiveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./locale";

export type { SupportedLocale };
// Pure locale value-logic lives in ./locale (DOM/JSON-free, unit-tested).
// Re-exported here so existing `from "../lib/i18n"` imports keep working.
export {
  activeWorkspaceLocale,
  isSupported,
  LOCALE_PREF_KEY,
  localeGateIsLoading,
  localeToApply,
  normalizeLocale,
  resolveEffectiveLocale,
  SUPPORTED_LOCALES,
};

/**
 * Boot-time cache key in localStorage. Used ONLY to avoid flash-of-wrong-
 * language before the engine preference loads. Never the source of truth.
 */
const LOCALE_CACHE_KEY = "houston.locale.cache";

export function getCachedLocale(): SupportedLocale | null {
  try {
    const v = localStorage.getItem(LOCALE_CACHE_KEY);
    return isSupported(v) ? v : null;
  } catch {
    return null;
  }
}

export function setCachedLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_CACHE_KEY, locale);
  } catch {
    /* ignore quota / disabled storage */
  }
}

const resources = {
  en: {
    common: commonEn,
    setup: setupEn,
    legal: legalEn,
    shell: shellEn,
    dashboard: dashboardEn,
    settings: settingsEn,
    chat: chatEn,
    board: boardEn,
    agents: agentsEn,
    skills: skillsEn,
    routines: routinesEn,
    providers: providersEn,
    errors: errorsEn,
    events: eventsEn,
    portable: portableEn,
    context: contextEn,
  },
  es: {
    common: commonEs,
    setup: setupEs,
    legal: legalEs,
    shell: shellEs,
    dashboard: dashboardEs,
    settings: settingsEs,
    chat: chatEs,
    board: boardEs,
    agents: agentsEs,
    skills: skillsEs,
    routines: routinesEs,
    providers: providersEs,
    errors: errorsEs,
    events: eventsEs,
    portable: portableEs,
    context: contextEs,
  },
  pt: {
    common: commonPt,
    setup: setupPt,
    legal: legalPt,
    shell: shellPt,
    dashboard: dashboardPt,
    settings: settingsPt,
    chat: chatPt,
    board: boardPt,
    agents: agentsPt,
    skills: skillsPt,
    routines: routinesPt,
    providers: providersPt,
    errors: errorsPt,
    events: eventsPt,
    portable: portablePt,
    context: contextPt,
  },
} as const;

// Pick an initial language: cached pref → navigator → 'en'.
const initialLng =
  getCachedLocale() ??
  normalizeLocale(
    typeof navigator !== "undefined" ? navigator.language : null,
  ) ??
  "en";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLng,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    nonExplicitSupportedLngs: true, // map pt-BR → pt, es-ES → es, etc.
    defaultNS: "common",
    ns: [
      "common",
      "setup",
      "legal",
      "shell",
      "dashboard",
      "settings",
      "chat",
      "board",
      "agents",
      "skills",
      "routines",
      "providers",
      "errors",
      "events",
      "portable",
      "context",
    ],
    interpolation: { escapeValue: false }, // react already escapes
    detection: {
      // Cache only — the engine preference is source of truth, applied by
      // `applyEngineLocale` once the engine handshake + pref are available.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_CACHE_KEY,
      caches: [],
    },
    react: { useSuspense: false },
  });

/**
 * Apply the engine-resolved locale to the live i18n instance and refresh the
 * boot cache, making the engine the source of truth. Pass `null` if neither
 * the workspace override nor the global preference is set — the detector pick
 * then stands. No-ops when the target already matches the active language.
 */
export async function applyEngineLocale(raw: string | null): Promise<void> {
  const target = localeToApply(raw, i18n.language);
  if (!target) return;
  await i18n.changeLanguage(target);
  setCachedLocale(target);
}

/** Change the active locale AND remember it in the boot cache. */
export async function changeLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  setCachedLocale(locale);
}

export default i18n;
