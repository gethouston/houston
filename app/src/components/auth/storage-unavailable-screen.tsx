import { Button } from "@houston-ai/core";
import i18n from "../../lib/i18n";

/**
 * Full-screen state shown when the device's secure storage can't be read
 * (locked, denied, or a stale post-update ACL) — distinct from a signed-out
 * user, so we NEVER show the sign-in screen here (that would read as a spurious
 * logout). The Retry button refetches the session query.
 *
 * Reads the i18n singleton directly (not useTranslation), matching
 * WorkspaceLoading: the web EngineGate renders these gate states OUTSIDE
 * <I18nextProvider>. Copy is deliberately non-technical (no mention of the
 * keychain, tokens, or files) for our non-technical audience.
 */
export function StorageUnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-gutter px-6 text-ink">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-lg font-medium">
          {i18n.t("errors:auth.storageUnavailableTitle")}
        </h1>
        <p className="text-sm text-ink-muted">
          {i18n.t("errors:auth.storageUnavailableBody")}
        </p>
        <Button className="mt-2" onClick={onRetry}>
          {i18n.t("errors:auth.storageUnavailableRetry")}
        </Button>
      </div>
    </div>
  );
}
