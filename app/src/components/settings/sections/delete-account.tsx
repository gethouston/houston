import { Button, FormDialog, Input } from "@houston-ai/core";
import { UserX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../../hooks/use-session";
import { deleteAccountAndSignOut } from "../../../lib/delete-account-flow";
import { stayOpen } from "../../../lib/dialog-stay-open";
import { isHostedGatewayEngine } from "../../../lib/engine";
import { isIdentityConfigured } from "../../../lib/identity";
import {
  AccountDeletionError,
  accountDeletionAvailable,
} from "../../../lib/identity/delete-account";
import { osIsTauri } from "../../../lib/os-bridge";
import { SettingsControlRow } from "../settings-row";

export function useAccountDeletionAvailable(): boolean {
  const { data: session } = useSession();
  return accountDeletionAvailable({
    identityConfigured: isIdentityConfigured(),
    hasSession: !!session,
    isTauri: osIsTauri(),
    hostedGateway: isHostedGatewayEngine(),
  });
}

type Failure = "team_member" | "network" | "generic";

function failureOf(err: unknown): Failure {
  if (err instanceof AccountDeletionError && err.kind === "team_member") {
    return "team_member";
  }
  if (err instanceof AccountDeletionError && err.kind === "network") {
    return "network";
  }
  return "generic";
}

/**
 * The account-wide row of the Danger zone (HOU-991): permanently delete the
 * hosted account and everything it owns, on every device. Guarded by a
 * type-to-confirm dialog; the request itself refuses (and deletes nothing)
 * while the user still belongs to team spaces.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation("settings");
  const available = useAccountDeletionAvailable();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);

  if (!available) return null;

  const confirmWord = t("deleteAccount.confirmWord");
  const armed = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  function close() {
    setTyped("");
    setFailure(null);
    setOpen(false);
  }

  async function submit() {
    setFailure(null);
    try {
      // On success the session goes null and the sign-in screen replaces this
      // whole settings surface; nothing to navigate. Sign-out-side failures
      // surface on the auth-error bus, which that screen renders.
      await deleteAccountAndSignOut();
    } catch (e) {
      // Three states the user can act on, each explained under the field: the
      // dialog stays with the typed word so the retry is one click.
      setFailure(failureOf(e));
      return stayOpen();
    }
  }

  return (
    <>
      <SettingsControlRow
        icon={UserX}
        title={t("deleteAccount.title")}
        description={t("deleteAccount.description")}
        destructive
      >
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          {t("deleteAccount.button")}
        </Button>
      </SettingsControlRow>

      <FormDialog
        open={open}
        onOpenChange={(next) => !next && close()}
        title={t("deleteAccount.confirmTitle")}
        description={t("deleteAccount.confirmBody")}
        primary={{
          label: t("deleteAccount.confirm"),
          variant: "destructive",
          onClick: submit,
          disabled: !armed,
        }}
        labels={{
          cancel: t("deleteAccount.cancel"),
          close: t("deleteAccount.dialogClose"),
        }}
      >
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            {t("deleteAccount.typeToConfirm", { word: confirmWord })}
          </p>
          <Input
            autoFocus
            value={typed}
            placeholder={confirmWord}
            aria-label={t("deleteAccount.typeToConfirm", {
              word: confirmWord,
            })}
            onChange={(e) => setTyped(e.target.value)}
          />
          {failure && (
            <p className="text-xs text-danger">
              {failure === "team_member"
                ? t("deleteAccount.errors.teamMember")
                : failure === "network"
                  ? t("deleteAccount.errors.network")
                  : t("deleteAccount.errors.generic")}
            </p>
          )}
        </div>
      </FormDialog>
    </>
  );
}
