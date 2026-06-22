import { Button } from "@houston-ai/core";
import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../../hooks/use-session";
import { signOut } from "../../../lib/auth";
import { isAuthConfigured } from "../../../lib/supabase";

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
    <section>
      <h2 className="text-lg font-semibold mb-4">{t("account.title")}</h2>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-10 w-10 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          {user.email && (
            <div className="text-xs text-muted-foreground truncate">
              {user.email}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          {t("account.signOut")}
        </Button>
      </div>
    </section>
  );
}

export function useAccountAvailable() {
  const { data: session } = useSession();
  return isAuthConfigured() && !!session?.user;
}
