import { initialsFor } from "@houston-ai/board";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../hooks/use-my-profile";
import { useSession } from "../../hooks/use-session";
import { signOut } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { identityHeaderFace } from "./identity-header-model";

/**
 * Who you are signed in as, at the head of the Settings index: the face, the
 * name, the email and the way out.
 *
 * This is the app's ONE identity control. The rail used to carry a second one —
 * an avatar button whose menu offered Account settings, Send feedback and Sign
 * out — but with Settings a permanent row in the rail's foot that menu was a
 * second door onto this very page, so it is gone and its one irreplaceable item,
 * Sign out, lives here.
 *
 * It renders on exactly the condition the old menu did: a resolved self-profile,
 * which only exists with a session, which only exists on a deployment with an
 * identity backend. Single-player desktop without auth draws nothing.
 *
 * Sign-out is the SAME `signOut` the old menu called (the purge path in
 * `lib/sign-out.ts`); it surfaces its own failure on the auth-error bus, which
 * the sign-in screen replacing this page renders, so the handler only keeps the
 * rejection from floating and leaves a line for the bug report.
 */
export function SettingsIdentityHeader() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  const profile = useMyProfile();

  if (!profile) return null;

  const face = identityHeaderFace({
    name: profile.name,
    email: session?.email,
    avatarUrl: profile.avatarUrl,
  });

  return (
    <div
      data-testid="settings-identity"
      className="flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-4"
    >
      <Avatar size="lg">
        {face.avatarUrl && (
          <AvatarImage
            src={face.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        <AvatarFallback className="text-sm font-medium">
          {initialsFor(face.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-ink">{face.name}</p>
        {face.email && (
          <p className="truncate text-sm text-ink-muted">{face.email}</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => {
          void signOut().catch((e: unknown) =>
            logger.error(`[auth] sign-out reported a failure: ${e}`),
          );
        }}
      >
        {t("account.signOut")}
      </Button>
    </div>
  );
}
