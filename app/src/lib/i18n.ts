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

import commonEn from "../locales/en/common.json";
import setupEn from "../locales/en/setup.json";
import legalEn from "../locales/en/legal.json";
import shellEn from "../locales/en/shell.json";
import dashboardEn from "../locales/en/dashboard.json";
import settingsEn from "../locales/en/settings.json";
import chatEn from "../locales/en/chat.json";
import boardEn from "../locales/en/board.json";
import agentsEn from "../locales/en/agents.json";
import skillsEn from "../locales/en/skills.json";
import routinesEn from "../locales/en/routines.json";
import integrationsEn from "../locales/en/integrations.json";
import providersEn from "../locales/en/providers.json";
import errorsEn from "../locales/en/errors.json";
import eventsEn from "../locales/en/events.json";
import gitEn from "../locales/en/git.json";
import portableEn from "../locales/en/portable.json";
import trackerEn from "../locales/en/tracker.json";
import commonEs from "../locales/es/common.json";
import setupEs from "../locales/es/setup.json";
import legalEs from "../locales/es/legal.json";
import shellEs from "../locales/es/shell.json";
import dashboardEs from "../locales/es/dashboard.json";
import settingsEs from "../locales/es/settings.json";
import chatEs from "../locales/es/chat.json";
import boardEs from "../locales/es/board.json";
import agentsEs from "../locales/es/agents.json";
import skillsEs from "../locales/es/skills.json";
import routinesEs from "../locales/es/routines.json";
import integrationsEs from "../locales/es/integrations.json";
import providersEs from "../locales/es/providers.json";
import errorsEs from "../locales/es/errors.json";
import eventsEs from "../locales/es/events.json";
import gitEs from "../locales/es/git.json";
import portableEs from "../locales/es/portable.json";
import trackerEs from "../locales/es/tracker.json";
import commonPt from "../locales/pt/common.json";
import setupPt from "../locales/pt/setup.json";
import legalPt from "../locales/pt/legal.json";
import shellPt from "../locales/pt/shell.json";
import dashboardPt from "../locales/pt/dashboard.json";
import settingsPt from "../locales/pt/settings.json";
import chatPt from "../locales/pt/chat.json";
import boardPt from "../locales/pt/board.json";
import agentsPt from "../locales/pt/agents.json";
import skillsPt from "../locales/pt/skills.json";
import routinesPt from "../locales/pt/routines.json";
import integrationsPt from "../locales/pt/integrations.json";
import providersPt from "../locales/pt/providers.json";
import errorsPt from "../locales/pt/errors.json";
import eventsPt from "../locales/pt/events.json";
import gitPt from "../locales/pt/git.json";
import portablePt from "../locales/pt/portable.json";
import trackerPt from "../locales/pt/tracker.json";

export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Engine preference key for the user's chosen UI locale. */
export const LOCALE_PREF_KEY = "locale";

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

export function isSupported(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/** Normalize a BCP-47 tag (`pt-BR`) to a supported locale (`pt`), or null. */
export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return isSupported(base) ? base : null;
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
    integrations: integrationsEn,
    providers: providersEn,
    errors: errorsEn,
    events: eventsEn,
    git: gitEn,
    portable: portableEn,
    tracker: trackerEn,
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
    integrations: integrationsEs,
    providers: providersEs,
    errors: errorsEs,
    events: eventsEs,
    git: gitEs,
    portable: portableEs,
    tracker: trackerEs,
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
    integrations: integrationsPt,
    providers: providersPt,
    errors: errorsPt,
    events: eventsPt,
    git: gitPt,
    portable: portablePt,
    tracker: trackerPt,
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
      "integrations",
      "providers",
      "errors",
      "events",
      "git",
      "portable",
      "tracker",
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
 * Apply a locale coming from the engine preference. Pass `null` if the
 * preference is unset and the detector-picked value should stand.
 */
export async function applyEngineLocale(raw: string | null): Promise<void> {
  const locale = normalizeLocale(raw);
  if (!locale) return;
  if (i18n.language === locale) return;
  await i18n.changeLanguage(locale);
  setCachedLocale(locale);
}

/** Change the active locale AND remember it in the boot cache. */
export async function changeLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  setCachedLocale(locale);
}

export default i18n;
