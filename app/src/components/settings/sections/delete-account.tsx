import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import { UserX } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../../hooks/use-session";
import { deleteAccountAndSignOut } from "../../../lib/delete-account-flow";
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
  // Synchronous in-flight guard shared by the AsyncButton click and the Enter
  // keydown (the api-key dialog's double-submit lesson): a ref flips before
  // React re-renders, so two rapid Enters can never fire two delete requests.
  const submitting = useRef(false);

  if (!available) return null;

  const confirmWord = t("deleteAccount.confirmWord");
  const armed = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  function close() {
    setTyped("");
    setFailure(null);
    setOpen(false);
  }

  async function submit() {
    if (submitting.current || !armed) return;
    submitting.current = true;
    setFailure(null);
    try {
      // On success the session goes null and the sign-in screen replaces this
      // whole settings surface; nothing to navigate. Sign-out-side failures
      // surface on the auth-error bus, which that screen renders.
      await deleteAccountAndSignOut();
    } catch (e) {
      setFailure(failureOf(e));
    } finally {
      submitting.current = false;
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

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent closeLabel={t("deleteAccount.dialogClose")}>
          <DialogHeader>
            <DialogTitle>{t("deleteAccount.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteAccount.confirmBody")}
            </DialogDescription>
          </DialogHeader>
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && armed) void submit();
              }}
            />
            {failure && (
              <p className="text-xs text-destructive">
                {failure === "team_member"
                  ? t("deleteAccount.errors.teamMember")
                  : failure === "network"
                    ? t("deleteAccount.errors.network")
                    : t("deleteAccount.errors.generic")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t("deleteAccount.cancel")}
            </Button>
            <AsyncButton
              variant="destructive"
              onClick={submit}
              disabled={!armed}
            >
              {t("deleteAccount.confirm")}
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
