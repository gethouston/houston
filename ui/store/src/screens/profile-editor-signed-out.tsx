"use client";

import { Button } from "@houston-ai/core";
import { LogIn } from "lucide-react";

/** The signed-out gate for the editor, shared so its copy cannot drift. */
export function ProfileEditorSignedOut({
  title = "Your creator profile",
  body = "Sign in to claim your handle and set up your public profile.",
  signIn = "Sign in",
  onSignIn,
}: {
  title?: string;
  body?: string;
  signIn?: string;
  onSignIn?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-5">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
        <p className="mt-2 text-ink-muted">{body}</p>
      </div>
      <Button size="lg" onClick={onSignIn}>
        <LogIn aria-hidden className="size-4" /> {signIn}
      </Button>
    </div>
  );
}
