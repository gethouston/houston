"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@houston-ai/core";
import { LayoutGrid, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useSession } from "@/lib/auth/session";

/** First letter of a name/email for the avatar fallback glyph. */
function initial(user: { displayName: string | null; email: string | null }) {
  const source = user.displayName || user.email || "";
  return source.trim().charAt(0).toUpperCase() || "?";
}

/**
 * The header's account control: the visible sign-in entry point. Shows a "Sign
 * in" button when signed out and an avatar dropdown (Your agents + Sign out) when
 * signed in. Renders nothing on a deployment with no auth configured, so an
 * un-provisioned preview never shows a dead button.
 */
export function UserMenu() {
  const { status, user, signIn, signOut } = useSession();
  const [busy, setBusy] = React.useState(false);

  if (status === "unconfigured") return null;
  if (status === "loading") {
    return <Skeleton className="size-8 rounded-full" />;
  }

  if (status === "signed-out" || !user) {
    return (
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signIn();
          } catch {
            // A closed popup or cancelled sign-in is a normal user action, not an
            // error to surface; the button simply re-enables.
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogIn aria-hidden className="size-4" />
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar className="size-8">
            {user.photoURL && (
              <AvatarImage
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback>{initial(user)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {user.displayName || user.email || "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">
            <LayoutGrid aria-hidden className="size-4" />
            Your agents
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut aria-hidden className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
