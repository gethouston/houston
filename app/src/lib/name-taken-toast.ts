import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";

export function showNameTakenToast(name: string): void {
  showExpectedStateToast(
    i18n.t("agents:files.nameTaken.title"),
    i18n.t("agents:files.nameTaken.description", { name }),
  );
}
