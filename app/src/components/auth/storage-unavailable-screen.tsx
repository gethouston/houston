import { Button } from "@houston-ai/core";
import i18n from "../../lib/i18n";
import { SpaceScreen } from "../space/space-screen";

/**
 * Full-screen state shown when the device's secure storage can't be read
 * (locked, denied, or a stale post-update ACL) — distinct from a signed-out
 * user, so we NEVER show the sign-in screen here (that would read as a spurious
 * logout). Renders on the same {@link SpaceScreen} space backdrop as the boot
 * splash and the sign-in screen, so the moment reads as one continuous space,
 * with a Retry button that refetches the session query.
 *
 * Reads the i18n singleton directly (not useTranslation), matching
 * WorkspaceLoading: the web EngineGate renders these gate states OUTSIDE
 * <I18nextProvider>. Copy is deliberately non-technical (no mention of the
 * keychain, tokens, or files) for our non-technical audience.
 */
export function StorageUnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <SpaceScreen>
      {/* The space canvas is theme-invariant DARK, but `action` follows the
          ambient app theme — in light mode the default Button would be a
          near-black pill on the near-black canvas. Pin the dark palette on
          this subtree (the design-system's sanctioned subtree-pin) so the
          Retry button always resolves against the backdrop. */}
      <div
        data-theme="dark"
        className="flex flex-1 items-center justify-center px-6"
      >
        <div className="flex max-w-md flex-col items-center gap-4 text-center text-[var(--ht-space-foreground)]">
          <h1 className="text-lg font-medium">
            {i18n.t("errors:auth.storageUnavailableTitle")}
          </h1>
          <p className="text-sm text-[var(--ht-space-foreground-muted)]">
            {i18n.t("errors:auth.storageUnavailableBody")}
          </p>
          <Button className="mt-2" onClick={onRetry}>
            {i18n.t("errors:auth.storageUnavailableRetry")}
          </Button>
        </div>
      </div>
    </SpaceScreen>
  );
}
