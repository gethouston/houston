import type { ReactNode } from "react";
import { HoustonLogo } from "../../shell/experience-card";

/**
 * The shared full-screen frame of the cloud-migration wizard (HOU-719):
 * centered logo + headline + body over the app background, matching the
 * migration-reconnect moment so the two migration surfaces read as one voice.
 * Content scrolls inside the frame; the page itself never scrolls.
 */
export function WizardFrame({
  title,
  body,
  children,
  footer,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  /** Pinned under the scrollable content (primary/secondary actions). */
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="flex min-h-0 w-full max-w-xl flex-col items-center gap-6 text-center">
        <HoustonLogo size={56} />
        <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
        {body && <p className="text-base text-muted-foreground">{body}</p>}
        {children && (
          <div className="min-h-0 w-full flex-1 overflow-y-auto text-left">
            {children}
          </div>
        )}
        {footer && (
          <div className="flex w-full flex-col items-center gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
