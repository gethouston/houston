import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProviderInfo } from "../../lib/providers";
import {
  supportsProviderApiKeySave,
  type ProviderCredentialSaveTarget,
} from "../../lib/provider-api-key";
import { ApiKeyForm } from "./api-key-form";
import { ConnectOrSeparator } from "./connect-dialog-layout";

interface Props {
  provider: ProviderInfo;
  /** Where to persist API keys. Cloud reconnect uses `activeAgent`. */
  credentialTarget?: ProviderCredentialSaveTarget;
  onSaved: () => void;
  /** Controlled expand state; omit for internal state. */
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}

export function ApiKeyAdvancedSection({
  provider,
  onSaved,
  credentialTarget,
  expanded: expandedProp,
  onExpandedChange,
}: Props) {
  const { t } = useTranslation("providers");
  const [expandedInternal, setExpandedInternal] = useState(false);
  const expanded = expandedProp ?? expandedInternal;
  const setExpanded = onExpandedChange ?? setExpandedInternal;
  const saveEnabled = supportsProviderApiKeySave(provider.id);

  return (
    <div className="min-w-0 space-y-3">
      <ConnectOrSeparator label={t("dualPathConnect.or")} />
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex min-w-0 items-center gap-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 break-words">{t("dualPathConnect.useApiKeyInstead")}</span>
      </button>
      {expanded && (
        <ApiKeyForm
          providerName={provider.name}
          providerId={provider.id}
          apiKeyConsoleUrl={provider.apiKeyConsoleUrl ?? ""}
          saveEnabled={saveEnabled}
          credentialTarget={credentialTarget}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
