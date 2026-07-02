/**
 * Type augmentation for react-i18next so `t()` keys are checked at compile
 * time. Catches typos like `t("dashoard:columns.running")` before runtime.
 *
 * English is the source of truth; other locales fall back to English at
 * runtime, so it's enough to type against the English namespace shapes.
 */

import "react-i18next";
import type agents from "../locales/en/agents.json";
import type board from "../locales/en/board.json";
import type chat from "../locales/en/chat.json";
import type common from "../locales/en/common.json";
import type connect from "../locales/en/connect.json";
import type context from "../locales/en/context.json";
import type dashboard from "../locales/en/dashboard.json";
import type errors from "../locales/en/errors.json";
import type events from "../locales/en/events.json";
import type integrations from "../locales/en/integrations.json";
import type legal from "../locales/en/legal.json";
import type portable from "../locales/en/portable.json";
import type providers from "../locales/en/providers.json";
import type routines from "../locales/en/routines.json";
import type settings from "../locales/en/settings.json";
import type setup from "../locales/en/setup.json";
import type shell from "../locales/en/shell.json";
import type skills from "../locales/en/skills.json";

declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      connect: typeof connect;
      setup: typeof setup;
      legal: typeof legal;
      shell: typeof shell;
      dashboard: typeof dashboard;
      settings: typeof settings;
      chat: typeof chat;
      board: typeof board;
      agents: typeof agents;
      skills: typeof skills;
      routines: typeof routines;
      providers: typeof providers;
      errors: typeof errors;
      events: typeof events;
      integrations: typeof integrations;
      portable: typeof portable;
      context: typeof context;
    };
  }
}
