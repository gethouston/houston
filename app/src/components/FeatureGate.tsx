/**
 * `FeatureGate` — render `children` only when the named feature flag is on.
 *
 * Pattern (per `docs/plans/2026-05-22-houston-advanced-settings.html` §4):
 *
 *     <FeatureGate flag="advanced.git_panel">
 *       <GitTab ... />
 *     </FeatureGate>
 *
 *     <FeatureGate flag="advanced.git_panel" fallback={<EmptyHint />}>
 *       <GitTab ... />
 *     </FeatureGate>
 *
 * The fallback is what renders when the flag is off; default is `null` (nothing).
 * Use a fallback to surface a one-time "Enable in Settings → Advanced" empty-state hint
 * where it makes sense (rule: only when the user would actually want the feature).
 */
import type { ReactNode } from "react";
import { useFeatureFlag } from "../hooks/useFeatureFlag";

interface Props {
  /** Flag key. e.g. `"advanced.git_panel"`. Must exist in `FLAG_REGISTRY`. */
  flag: string;
  children: ReactNode;
  /** Rendered when the flag is off. Default: `null`. */
  fallback?: ReactNode;
}

export function FeatureGate({ flag, children, fallback = null }: Props) {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
}
