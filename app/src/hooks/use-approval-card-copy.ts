import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ApprovalCardCopy } from "../lib/interaction-approval-labels";
import { normalizeLocale, type SupportedLocale } from "../lib/locale";
import en from "../locales/en/assistant-approvals.json";
import es from "../locales/es/assistant-approvals.json";
import pt from "../locales/pt/assistant-approvals.json";

/**
 * The approval card's copy, in the reader's language.
 *
 * The per-operation sentences and argument names are read from the locale JSON
 * DIRECTLY rather than through `t()`: their keys are catalog operation and
 * parameter names, which are only known at runtime, and a typed `t()` cannot
 * take a key it cannot see. Reading the bundles here keeps the lookup honest —
 * `es`/`pt` are typed against `en`, so a missing sentence is a COMPILE error,
 * not a card that quietly falls back to a key name. The connective copy, whose
 * keys are fixed, comes from `t()` like everything else.
 */

type ApprovalBundle = typeof en;
const BUNDLES: Readonly<Record<SupportedLocale, ApprovalBundle>> = {
  en,
  es,
  pt,
};

/** The operation names this build carries a sentence for. */
type OperationKey = keyof ApprovalBundle["operations"];
const isOperation = (name: string): name is OperationKey =>
  name in en.operations;

/** The parameter names the shared map covers. */
type ArgumentKey = keyof ApprovalBundle["arguments"];
const isArgument = (name: string): name is ArgumentKey => name in en.arguments;

/** The operations whose own `id`/`slug` names something specific. */
type OverrideKey = keyof ApprovalBundle["argumentsByOperation"];
const isOverridden = (name: string): name is OverrideKey =>
  name in en.argumentsByOperation;

/** `agentPath` -> `agent path`, for a parameter no map covers (a host newer
 *  than this build). Never the raw camelCase, which reads as code. */
function humanize(param: string): string {
  return param
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

export function useApprovalCardCopy(): ApprovalCardCopy {
  const { t, i18n } = useTranslation("chat");
  const language = i18n.language;
  return useMemo(() => {
    const bundle = BUNDLES[normalizeLocale(language) ?? "en"];
    const number = new Intl.NumberFormat(language);
    const override = (operation: string, param: string): string | undefined => {
      if (!isOverridden(operation)) return undefined;
      const names: Record<string, string> =
        bundle.argumentsByOperation[operation];
      return names[param];
    };
    return {
      approve: t("approvalCard.approve"),
      decline: t("approvalCard.decline"),
      closing: t("approvalCard.closing"),
      affects: (args) => t("approvalCard.affects", { arguments: args }),
      argument: (name, value) => t("approvalCard.argument", { name, value }),
      exactValue: (name) => t("approvalCard.exactValue", { name }),
      truncated: (count) =>
        t("approvalCard.truncated", {
          count,
          formatted: number.format(count),
        }),
      sentence: (operation) =>
        isOperation(operation) ? bundle.operations[operation] : undefined,
      argumentName: (operation, param) =>
        override(operation, param) ??
        (isArgument(param) ? bundle.arguments[param] : humanize(param)),
    };
  }, [t, language]);
}
