import type { ReactNode } from "react";
import { HoustonLogo } from "../../shell/experience-card";

/**
 * The shared full-screen frame of the cloud-migration wizard (HOU-719):
 * centered logo + headline + body over the app background, matching the
 * migration-reconnect moment so the two migration surfaces read as one voice.
 * Content scrolls inside the frame; the page itself never scrolls.
 */
export function WizardFrame({
  badge,
  eyebrow,
  title,
  body,
  children,
  footer,
  hideLogo,
  wide,
}: {
  /** A pill/badge above the title (e.g. the beta early-access badge). */
  badge?: ReactNode;
  /** Small sentence-case line above the title (e.g. "Step 1 of 2"). */
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  /** Pinned under the scrollable content (primary/secondary actions). */
  footer?: ReactNode;
  /** Omit the top logo when the screen has its own centerpiece mark (e.g. the
   *  progress loader's helmet), so the helmet doesn't render twice. */
  hideLogo?: boolean;
  /** Widen the column for content-rich screens (the announcement's benefit
   *  cards + stepper need more room than the default reading width). */
  wide?: boolean;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <div
        className={`flex min-h-0 w-full flex-col items-center gap-6 text-center ${wide ? "max-w-[820px]" : "max-w-xl"}`}
      >
        {!hideLogo && <HoustonLogo size={56} />}
        {badge}
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
        </div>
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
