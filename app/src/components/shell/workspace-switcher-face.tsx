import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../hooks/use-my-profile";
import { useSession } from "../../hooks/use-session";
import { useWorkspaceStore } from "../../stores/workspaces";

export function SignedInHeader(props: { name: string; email: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-ink text-sm">{props.name}</span>
      {props.email && props.email !== props.name && (
        <span className="truncate text-ink-muted text-xs">{props.email}</span>
      )}
    </span>
  );
}

export function useWorkspaceSwitcherFace(): {
  title: string;
  header: ReactNode | undefined;
} {
  const { t } = useTranslation("shell");
  const profile = useMyProfile();
  const { data: session } = useSession();
  const current = useWorkspaceStore((s) => s.current);
  const title = current?.name ?? t("sidebar.selectWorkspace");
  return {
    title,
    header: profile ? (
      <SignedInHeader name={profile.name} email={session?.email ?? ""} />
    ) : undefined,
  };
}
