/**
 * The ONE surface for "Houston cannot write to this workspace" — the host's
 * `read_only` 403, raised when the workspace folder answers EACCES/EPERM/EROFS
 * (`packages/host/src/turn/files-names.ts`): a read-only mount, a folder whose
 * permissions were revoked, a locked-down machine.
 *
 * Unlike its sibling `name-taken-toast.ts` this state is BOTH reported and
 * shown. Reported because a workspace Houston cannot write to is a broken
 * install, not an ordinary state of the product, and we want to know how often
 * it happens: `tauriFiles` deliberately does not add this code to its `silence`
 * classifier, so the engine-call layer has already filed the Sentry report (and
 * the frontend log line) by the time this runs. Shown because the report alone
 * would leave the person clicking Rename into silence — so they get authored
 * copy naming the one remedy they can act on, in the calm informational shape,
 * never the generic red box.
 */
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";

export function showReadOnlyToast(): void {
  showExpectedStateToast(
    i18n.t("agents:files.readOnly.title"),
    i18n.t("agents:files.readOnly.description"),
  );
}
