import { initialsFor } from "@houston-ai/board";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@houston-ai/core";
import { CircleUserRound, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../hooks/use-my-profile";
import { useProfileAvailable } from "../../hooks/use-profile-available";
import { useSession } from "../../hooks/use-session";
import { signOut } from "../../lib/auth";
import { logAndReportError } from "../../lib/error-report";
import type { NavMode } from "../../lib/nav-stack";
import { useUIStore } from "../../stores/ui";
import {
  ABOUT_ME_VIEW_ID,
  type AccountViewId,
  PROFILE_VIEW_ID,
} from "../account/id";
import { MenuItemRow } from "./workspace-account";
import { SignedInHeader } from "./workspace-switcher-face";

function AccountAvatar(props: { name: string; avatarUrl: string | null }) {
  return (
    <Avatar className="size-5">
      {props.avatarUrl && (
        <AvatarImage
          src={props.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback className="font-medium text-xs">
        {initialsFor(props.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export interface AccountAction {
  id: "profile" | "aboutMe" | "signOut";
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  dataAttrs?: Record<string, string>;
}

export interface AccountMenuParts {
  label: string;
  avatar: ReactNode;
  header: ReactNode;
  personal: ReactNode;
  signOut: ReactNode;
  identity: { name: string; email: string } | null;
  actions: AccountAction[];
}

export function useAccountMenu(opts: {
  nav?: NavMode;
  onNavigate: () => void;
}): AccountMenuParts {
  const { t } = useTranslation("shell");
  const profile = useMyProfile();
  const { data: session } = useSession();
  const profileAvailable = useProfileAvailable();
  const setViewMode = useUIStore((s) => s.setViewMode);
  const open = (view: AccountViewId) => {
    setViewMode(view, { nav: opts.nav });
    opts.onNavigate();
  };
  const header = profile && (
    <>
      <DropdownMenuLabel className="font-normal">
        <SignedInHeader name={profile.name} email={session?.email ?? ""} />
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
    </>
  );
  const profileAction: AccountAction = {
    id: "profile",
    icon: <CircleUserRound className="size-4" aria-hidden="true" />,
    label: t("accountMenu.profile"),
    onSelect: () => open(PROFILE_VIEW_ID),
  };
  const aboutMeAction: AccountAction = {
    id: "aboutMe",
    icon: <UserRound className="size-4" aria-hidden="true" />,
    label: t("accountMenu.aboutMe"),
    onSelect: () => open(ABOUT_ME_VIEW_ID),
  };
  const signOutAction: AccountAction = {
    id: "signOut",
    icon: <LogOut className="size-4" aria-hidden="true" />,
    label: t("accountMenu.signOut"),
    dataAttrs: { "data-testid": "account-sign-out" },
    onSelect: () => {
      void signOut().catch((e: unknown) =>
        logAndReportError("account-sign-out", e),
      );
    },
  };
  const personal = (
    <>
      {profileAvailable && <MenuItemRow {...profileAction} />}
      <MenuItemRow {...aboutMeAction} />
    </>
  );
  const signOutRow = profile && (
    <>
      <DropdownMenuSeparator />
      <MenuItemRow {...signOutAction} />
    </>
  );
  return {
    label: t("sidebar.account"),
    avatar: profile ? (
      <AccountAvatar name={profile.name} avatarUrl={profile.avatarUrl} />
    ) : (
      <UserRound className="size-4" aria-hidden="true" />
    ),
    header: header || null,
    personal,
    signOut: signOutRow || null,
    identity: profile
      ? { name: profile.name, email: session?.email ?? "" }
      : null,
    actions: [
      ...(profileAvailable ? [profileAction] : []),
      aboutMeAction,
      ...(profile ? [signOutAction] : []),
    ],
  };
}
