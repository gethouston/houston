import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateTeamDialog } from "../shell/create-team-dialog";

/** Shared personal-space face for every People surface. */
export function CreateOrganizationInviteEmpty() {
  const { t } = useTranslation("teams");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{t("people.createOrganization.title")}</EmptyTitle>
          <EmptyDescription>
            {t("people.createOrganization.body")}
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => setDialogOpen(true)}>
          {t("people.createOrganization.cta")}
        </Button>
      </Empty>
      <CreateTeamDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
