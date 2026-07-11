import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../../hooks/use-my-profile";
import { useSession } from "../../../hooks/use-session";
import { signOut } from "../../../lib/auth";
import { isIdentityConfigured } from "../../../lib/identity";
import { SettingsControlRow } from "../settings-row";

/** Up to two leading letters from the display name, for the no-photo fallback. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function AccountSection() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  const profile = useMyProfile();

  if (!isIdentityConfigured() || !session || !profile) return null;

  // Read the SAME resolved identity every other self-face uses: the display
  // name + provider (Google/Microsoft) photo carried on the identity session.
  // Read-only — avatar upload returns when the gateway profile store lands.
  const displayName = profile.name;
  const avatar = profile.avatarUrl;

  return (
    <SettingsControlRow
      leading={
        avatar ? (
          <img
            src={avatar}
            alt=""
            className="size-6 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
            {initialsOf(displayName)}
          </span>
        )
      }
      title={displayName}
      description={session.email || undefined}
    >
      <Button variant="outline" size="sm" onClick={() => signOut()}>
        {t("account.signOut")}
      </Button>
    </SettingsControlRow>
  );
}

export function useAccountAvailable() {
  const { data: session } = useSession();
  return isIdentityConfigured() && !!session;
}
