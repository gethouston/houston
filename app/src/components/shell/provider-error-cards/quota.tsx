/**
 * Quota / model-availability variants — the "pay or switch" outcomes.
 * QuotaExhausted names the reset time when the provider gives one and offers a
 * "switch provider" CTA; ModelUnavailable offers a one-click "switch to the
 * suggested fallback" (applied directly on the same provider, no picker) plus a
 * "pick another model" CTA that pops the model picker; ContextOverflow (the
 * chat outgrew the model's window) offers the picker so the user can move the
 * conversation onto a larger-window model. All render on the unified `RowCard`
 * (HOU-467), with their CTAs mounted as `RowCardButton`s in the card's action
 * slot.
 *
 * Per-user AI accounts (HOU-976) touch ModelUnavailable alone: it names the
 * PERSONAL plan that lacks the model, so a member does not go asking an admin to
 * fix a plan that is theirs. Absent credential context leaves the copy untouched.
 */

import type { ProviderError } from "@houston-ai/chat";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { credentialScopeOf } from "../../../lib/credential-scope";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerLabel } from "./shared";

interface BaseProps {
  /** Open the model picker so the user can choose a different model/provider. */
  onSwitchModel?: () => void;
}

export function QuotaExhaustedCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "quota_exhausted" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const body = error.resets_at
    ? t("providerError.quotaExhausted.bodyWithReset", {
        provider,
        time: error.resets_at,
      })
    : t("providerError.quotaExhausted.body", { provider });
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<XCircleIcon className="size-5" />}
        title={t("providerError.quotaExhausted.title")}
        description={body}
        // `undefined`, not `false`: `RowCard`'s slot test is `!= null`, and
        // `false` passes it — an action-less card would still mount the empty
        // action <span> and its gap.
        action={
          onSwitchModel ? (
            <RowCardButton
              variant="outline"
              label={t("providerError.quotaExhausted.switchProvider")}
              onClick={onSwitchModel}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export function ContextOverflowCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "context_overflow" }>;
}) {
  const { t } = useTranslation("shell");
  // Name the model when the wire carried it, else fall back to the provider's
  // display name — the sentence must always name WHAT ran out of room.
  const model = error.model ?? providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.contextOverflow.title")}
        description={t("providerError.contextOverflow.body", { model })}
        // `undefined`, not `false`: `RowCard`'s slot test is `!= null`, and
        // `false` passes it — an action-less card would still mount the empty
        // action <span> and its gap.
        action={
          onSwitchModel ? (
            <RowCardButton
              variant="outline"
              label={t("providerError.contextOverflow.switchModel")}
              onClick={onSwitchModel}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export function ModelUnavailableCard({
  error,
  onSwitchModel,
  onApplyModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "model_unavailable" }>;
  /** Apply the suggested fallback model directly (one click, no picker). */
  onApplyModel?: (model: string) => void;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const fallback = error.suggested_fallback;
  // Name WHOSE plan lacks the model when the wire says the turn ran on the
  // sender's own account (HOU-976). A member reading "your {{provider}}
  // account" would otherwise reasonably read it as the team's, and go asking an
  // admin to fix a plan that is theirs. No credential context (desktop,
  // self-host, personal space, routine) keeps the body byte-identical.
  const personal = credentialScopeOf(error.credential) === "personal";
  // `not_deployed` (Azure) outranks the personal-plan wording: the model is
  // missing from the RESOURCE, not from a plan, and picking another model
  // fails the same way until the user deploys one under the model's exact
  // name (PRODUCT-1600).
  const bodyKey =
    error.reason === "not_deployed"
      ? "providerError.modelUnavailable.bodyNotDeployed"
      : personal
        ? "providerError.credential.modelUnavailableBody"
        : "providerError.modelUnavailable.body";
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.modelUnavailable.title")}
        description={t(bodyKey, { provider, model: error.model })}
        // Same `undefined`-not-a-fragment rule as the card above.
        action={
          (fallback && onApplyModel) || onSwitchModel ? (
            <>
              {fallback && onApplyModel && (
                <RowCardButton
                  label={t("providerError.modelUnavailable.switchToFallback", {
                    model: fallback,
                  })}
                  onClick={() => onApplyModel(fallback)}
                />
              )}
              {onSwitchModel && (
                <RowCardButton
                  variant="outline"
                  label={t("providerError.modelUnavailable.pickAnother")}
                  onClick={onSwitchModel}
                />
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
