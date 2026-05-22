import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  useActiveAgentCredential,
  useRevokeAgentCredential,
} from "../../../hooks/queries/use-agent-credentials";

interface Props {
  agentName: string;
  agentPath: string;
}

/** One row in the Authorized agents list. */
export function AgentCredentialsRow({ agentName, agentPath }: Props) {
  const { t } = useTranslation("settings");
  const credential = useActiveAgentCredential(agentPath);
  const revoke = useRevokeAgentCredential(agentPath);

  const shortId = useMemo(() => {
    if (!credential) return null;
    const id = credential.credential_id;
    if (id.length <= 18) return id;
    return `${id.slice(0, 9)}…${id.slice(-6)}`;
  }, [credential]);

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{agentName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {credential ? (
            <>
              <code className="font-mono">{shortId}</code>
              {credential.delegated_by_subject_id ? (
                <span>
                  {" · "}
                  {t("agents.columnDelegation")}
                  {": "}
                  <code className="font-mono">
                    {credential.delegated_by_subject_id}
                  </code>
                </span>
              ) : null}
            </>
          ) : (
            <span className="italic">{t("agents.noCredential")}</span>
          )}
        </div>
      </div>

      {credential ? <StatusPill status={credential.status} /> : null}

      {credential ? (
        <button
          type="button"
          className="rounded-full border border-black/15 px-3 h-8 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          disabled={revoke.isPending || credential.status !== "active"}
          onClick={() => {
            if (window.confirm(t("agents.revokeConfirm"))) {
              revoke.mutate(credential.credential_id);
            }
          }}
        >
          {t("agents.revoke")}
        </button>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation("settings");
  const label =
    status === "active"
      ? t("identity.statusVerified")
      : status === "revoked"
        ? t("identity.statusRevoked")
        : status;
  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "revoked"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span
      className={`text-xs font-medium rounded-full border px-2.5 h-6 inline-flex items-center ${tone}`}
    >
      {label}
    </span>
  );
}
