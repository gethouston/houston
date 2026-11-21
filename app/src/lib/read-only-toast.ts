import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";

export function showReadOnlyToast(): void {
  showExpectedStateToast(
    i18n.t("agents:files.readOnly.title"),
    i18n.t("agents:files.readOnly.description"),
  );
}
