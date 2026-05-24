/**
 * TimezoneGate — blocks Routines until the user confirms an IANA timezone.
 *
 * Cron without a zone is meaningless. We refuse to autosave the detected zone
 * because picking wrong leads to "why did this fire at 3am?" tickets. We
 * pre-select the browser-detected zone but require an explicit confirmation.
 */
import { useMemo, useState } from "react";
import { cn, Button } from "@houston-ai/core";
import { Globe } from "lucide-react";

export interface TimezoneGateProps {
  /** Browser-detected IANA zone, used as the default selection. */
  detected: string;
  /** Persist the chosen zone. Resolves once the engine has acknowledged. */
  onConfirm: (tz: string) => Promise<void> | void;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function listTimezones(): string[] {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported && supported.length) return supported;
  } catch {
    // fall through
  }
  return COMMON_TIMEZONES;
}

const fieldClass = cn(
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
  "text-foreground transition-colors duration-200",
  "focus:outline-none focus:border-foreground/40",
  "appearance-none cursor-pointer pl-9",
);

function formatOffset(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = fmt.formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value;
    return offset ?? "";
  } catch {
    return "";
  }
}

export function TimezoneGate({ detected, onConfirm }: TimezoneGateProps) {
  const [selected, setSelected] = useState(detected);
  const [saving, setSaving] = useState(false);
  const timezones = useMemo(listTimezones, []);
  const offset = useMemo(() => formatOffset(selected), [selected]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onConfirm(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background px-6">
      <div
        className={cn("w-full max-w-md rounded-xl bg-secondary", "px-7 py-8")}
      >
        {/* Hero glyph */}
        <div className="flex items-center justify-center mb-5">
          <div className="size-11 rounded-full bg-background flex items-center justify-center border border-black/[0.04]">
            <Globe className="size-5 text-foreground" strokeWidth={1.75} />
          </div>
        </div>

        <h2 className="text-lg font-medium text-foreground text-center tracking-tight">
          What's your timezone?
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-1.5 leading-relaxed">
          Routines run on a schedule. We need to know your zone before any of
          them fire — so 9am means <em className="not-italic">your</em> 9am.
        </p>

        {/* Picker */}
        <div className="mt-7">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Timezone
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className={fieldClass}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[11px] text-muted-foreground">
              Detected from your computer.
            </p>
            {offset && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {offset}
              </p>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="mt-6">
          <Button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="w-full"
          >
            {saving ? "Saving…" : "Confirm timezone"}
          </Button>
        </div>
      </div>
    </div>
  );
}
