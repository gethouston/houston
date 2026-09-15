/**
 * The ONE surface for "that file name is already in use" — the up-front check
 * (`detectRenameConflict`, before any request) and the host's 409 (the race
 * that check cannot close) say the same sentence to the user, because to them
 * it is the same thing: the name is taken. Nothing is broken, so it is a plain
 * informational toast, never the report-a-bug path.
 */
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";

export function showNameTakenToast(name: string): void {
  showExpectedStateToast(
    i18n.t("agents:files.nameTaken.title"),
    i18n.t("agents:files.nameTaken.description", { name }),
  );
}
