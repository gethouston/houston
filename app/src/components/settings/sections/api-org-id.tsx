import { useTranslation } from "react-i18next";
import { useOrgs } from "../../../hooks/queries/use-spaces";
import { connectOrgSlug } from "../../../lib/agent-connect-model";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { CopyIdRow } from "../copy-id-row";

export function useOrgSlug(enabled = true): {
  slug: string | null;
  failed: boolean;
} {
  const workspace = useWorkspaceStore((s) => s.current);
  const { data: orgs, isError } = useOrgs(enabled);
  const slug = connectOrgSlug(workspace?.id, orgs);
  return { slug, failed: !slug && isError };
}

export function ApiOrgId() {
  const { t } = useTranslation("settings");
  const workspace = useWorkspaceStore((s) => s.current);
  const { slug, failed } = useOrgSlug();
  if (failed) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-line bg-card">
      <CopyIdRow
        label={t("apiKeys.orgId.title")}
        value={slug}
        copyFailedTitle={t("apiKeys.orgId.copyFailed")}
        reportKey="copy_org_id"
      />
      <p className="px-4 pb-3 text-xs text-ink-muted">
        {workspace
          ? t("apiKeys.orgId.description", { org: workspace.name })
          : t("apiKeys.orgId.descriptionNoName")}
      </p>
    </div>
  );
}
