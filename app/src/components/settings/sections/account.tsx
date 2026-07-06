import { Button } from "@houston-ai/core";
import { UserCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../../hooks/use-session";
import { signOut } from "../../../lib/auth";
import { isAuthConfigured } from "../../../lib/supabase";
import { SettingsControlRow } from "../settings-row";

export function AccountSection() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  if (!isAuthConfigured() || !session?.user) return null;

  const user = session.user;
  const meta = (user.user_metadata ?? {}) as {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  const displayName =
    meta.full_name ?? meta.name ?? user.email ?? t("account.fallbackName");
  const avatar = meta.avatar_url ?? null;

  return (
    <SettingsControlRow
      leading={
        avatar ? (
          <img
            src={avatar}
            alt=""
            className="size-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserCircle className="size-[18px] text-muted-foreground" />
        )
      }
      title={displayName}
      description={user.email ?? undefined}
    >
      <Button variant="outline" size="sm" onClick={() => signOut()}>
        {t("account.signOut")}
      </Button>
    </SettingsControlRow>
  );
}

export function useAccountAvailable() {
  const { data: session } = useSession();
  return isAuthConfigured() && !!session?.user;
}
