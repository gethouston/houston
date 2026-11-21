import type { SupportedLocale } from "../../../lib/i18n";
import type { LocaleWriteOutcome } from "../../../stores/workspace-locale-writes";

export interface LanguageChangeDeps {
  shown: () => SupportedLocale;
  show: (locale: SupportedLocale) => Promise<void>;
  announce: (locale: SupportedLocale) => void;
  save: (
    workspaceId: string,
    locale: SupportedLocale,
  ) => Promise<LocaleWriteOutcome>;
  restored: (workspaceId: string) => SupportedLocale | null;
  refused: (err: unknown) => void;
}

export function createLanguageChange(deps: LanguageChangeDeps) {
  let pending = 0;
  let baseline = deps.shown();
  return async (workspaceId: string, value: SupportedLocale): Promise<void> => {
    if (pending === 0) baseline = deps.shown();
    pending++;
    const saved = deps.save(workspaceId, value).then(
      () => null,
      (err: unknown) => ({ err }),
    );
    void saved.then(() => {
      pending--;
    });
    await deps.show(value);
    deps.announce(value);
    const refused = await saved;
    if (!refused) return;
    await deps.show(deps.restored(workspaceId) ?? baseline);
    deps.refused(refused.err);
  };
}
