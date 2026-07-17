import { ShieldCheck } from "lucide-react";

/**
 * The role-aware blocked-state CTA: a small pill that deep-links a viewer who
 * CAN lift a policy ceiling into the Admin Permissions area, replacing the
 * ask-your-admin line members see. Presentational (label + click in), so the
 * leaf sections that render it stay store-free; the surface that has the policy
 * data owns the destination. Visible at rest (no hover gating).
 */
export function EnableInPermissionsButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-input px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
    >
      <ShieldCheck className="size-3.5" />
      {label}
    </button>
  );
}
