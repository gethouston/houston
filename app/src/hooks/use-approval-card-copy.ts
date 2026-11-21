import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ApprovalCardCopy } from "../lib/interaction-approval-labels";
import { normalizeLocale, type SupportedLocale } from "../lib/locale";
import en from "../locales/en/assistant-approvals.json";
import es from "../locales/es/assistant-approvals.json";
import pt from "../locales/pt/assistant-approvals.json";

type ApprovalBundle = typeof en;
const BUNDLES: Readonly<Record<SupportedLocale, ApprovalBundle>> = {
  en,
  es,
  pt,
};

type OperationKey = keyof ApprovalBundle["operations"];
const isOperation = (name: string): name is OperationKey =>
  name in en.operations;

type ArgumentKey = keyof ApprovalBundle["arguments"];
const isArgument = (name: string): name is ArgumentKey => name in en.arguments;

type OverrideKey = keyof ApprovalBundle["argumentsByOperation"];
const isOverridden = (name: string): name is OverrideKey =>
  name in en.argumentsByOperation;

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
        (isArgument(param)
          ? bundle.arguments[param]
          : param.includes(".")
            ? param
                .split(".")
                .map((part) =>
                  isArgument(part) ? bundle.arguments[part] : humanize(part),
                )
                .join(" ")
            : humanize(param)),
      hire: (name) => t("approvalCard.hire", { name }),
      instructionsLabel: t("approvalCard.instructionsLabel"),
      storeRefusal: t("plan:managedOnWeb"),
      storeRefusalOk: t("approvalCard.storeRefusalOk"),
    };
  }, [t, language]);
}
