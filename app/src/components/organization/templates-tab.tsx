import {
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import type { TemplateSummary } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteTemplate, useOrgTemplates } from "../../hooks/queries";
import { useSession } from "../../hooks/use-session";
import { modelBrand } from "../../lib/template-summary";
import { memberLabel } from "./org-roster";
import { OrgTemplateCard } from "./org-template-card";
import { canDeleteTemplate } from "./org-templates-model";
import type { OrgTabProps } from "./organization-view";

/**
 * Organization > Templates: the org's saved agent templates as list cards
 * (name, description, "3 skills · Claude · 2 apps", and who created it, resolved
 * to a name against the roster). A confirm-gated delete is shown only to the
 * owner or the template's creator — the gateway is the real enforcer, this hides
 * an affordance the caller can't act on. Fresh orgs get an empty state nudging
 * them to save an agent as a template. The shell already gates this view to a
 * multiplayer owner/admin, so it never mounts elsewhere. Delete failures surface
 * through the mutation's `call()` wrapper (toast + Report bug).
 */
export default function TemplatesTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const enabled = ctx.role === "owner" || ctx.role === "admin";
  const { data: templates, isLoading, isError } = useOrgTemplates(enabled);
  const deleteTemplate = useDeleteTemplate();
  const [pendingDelete, setPendingDelete] = useState<TemplateSummary | null>(
    null,
  );

  const members = ctx.org.members;

  const metaLine = (template: TemplateSummary): string => {
    const segments = [
      t("templatesTab.card.skills", { count: template.skillCount }),
      modelBrand(template.model),
      template.allowedToolkitCount === null
        ? t("templatesTab.card.allApps")
        : t("templatesTab.card.apps", { count: template.allowedToolkitCount }),
    ];
    return segments.filter(Boolean).join(" · ");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        {t("templatesTab.error")}
      </p>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("templatesTab.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("templatesTab.empty.body")}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="mt-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <OrgTemplateCard
            key={template.id}
            name={template.name}
            description={template.description}
            meta={metaLine(template)}
            createdBy={t("templatesTab.card.createdBy", {
              name: memberLabel(template.createdBy, members),
            })}
            canDelete={canDeleteTemplate({
              isOwner: ctx.isOwner,
              createdBy: template.createdBy,
              currentUserId,
            })}
            deleteLabel={t("templatesTab.deleteLabel", {
              name: template.name,
            })}
            onDelete={() => setPendingDelete(template)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("templatesTab.deleteConfirm.title", {
          name: pendingDelete?.name ?? "",
        })}
        description={t("templatesTab.deleteConfirm.description")}
        confirmLabel={t("templatesTab.deleteConfirm.confirm")}
        cancelLabel={t("templatesTab.deleteConfirm.cancel")}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) deleteTemplate.mutate(target.id);
        }}
      />
    </div>
  );
}
