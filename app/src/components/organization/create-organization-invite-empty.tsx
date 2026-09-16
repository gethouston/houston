import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateOrganizationDialog } from "../shell/create-organization-dialog";

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
      <CreateOrganizationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
