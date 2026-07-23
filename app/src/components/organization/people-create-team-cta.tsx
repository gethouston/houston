import { Button } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateTeamDialog } from "../shell/create-team-dialog";

/**
 * The People body for a PERSONAL space (C8). A personal space is non-invitable
 * (the gateway answers `403 personal_space` on any member-add), so instead of
 * an "Add someone" form that can only fail we offer the one path that works:
 * create a team and invite people there. `CreateTeamDialog` switches straight
 * into the new team on success, capabilities refetch with `spaceKind: "team"`,
 * and the People tab re-renders as the real roster + invite surface — the
 * user's invite journey continues without a dead end.
 */
export function PeopleCreateTeamCta() {
  const { t } = useTranslation("teams");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-ink/5 bg-chip p-4">
      <h2 className="mb-1 text-sm font-medium text-ink">
        {t("people.personal.title")}
      </h2>
      <p className="mb-3 text-xs text-ink-muted">{t("people.personal.body")}</p>
      <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
        {t("people.personal.cta")}
      </Button>
      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
