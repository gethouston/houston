import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, MessageSquare, User } from "lucide-react";
import { useSession } from "../../hooks/use-session";
import { signOut } from "../../lib/auth";
import { useUIStore } from "../../stores/ui";
import { FeedbackDialog } from "./feedback-dialog";

/**
 * Sidebar footer row showing the signed-in user. Click → dropdown with
 * "Account settings", "Send feedback", and "Sign out". Hidden when
 * there's no session.
 *
 * "Send feedback" is the always-available channel for things Sentry can't
 * auto-capture (UX confusion, missing features, soft errors that didn't
 * throw). Crash data flows to Sentry automatically — this is the
 * complement, not a replacement.
 */
export function UserMenu() {
  const { t } = useTranslation("shell");
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const setViewMode = useUIStore((s) => s.setViewMode);

  if (!session?.user) return null;

  const user = session.user;
  const meta = (user.user_metadata ?? {}) as {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  const displayName = meta.full_name ?? meta.name ?? user.email ?? "Signed in";
  const avatar = meta.avatar_url ?? null;

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <>
      <div className="relative mx-2 mb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent transition-colors"
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-6 w-6 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm truncate flex-1 min-w-0">{displayName}</span>
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover shadow-md z-20 overflow-hidden">
              <button
                onClick={() => {
                  setOpen(false);
                  setViewMode("settings");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <User className="h-3.5 w-3.5" />
                Account settings
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setFeedbackOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("userMenu.sendFeedback")}
              </button>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
