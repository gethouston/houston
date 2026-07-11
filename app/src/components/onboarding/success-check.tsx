import { Check } from "lucide-react";

// The one celebratory accent moment (design-system color restraint): the
// futuristic space nebula palette carried as decorative chrome, tokens only.
const CELEBRATORY_FILL =
  "linear-gradient(135deg, var(--ht-space-nebula-1) 0%, var(--ht-space-nebula-core) 50%, var(--ht-space-star-warm) 100%)";

/**
 * The onboarding finished-screen "done" mark: a large filled circle with a check
 * that pops in, wrapped by an expanding ring. Its one and only caller is the
 * finished mission, so this is a single fixed variant — the warm space-nebula
 * gradient fill is the one place onboarding breaks from monochrome.
 */
export function SuccessCheck() {
  return (
    <span className="relative flex size-20 items-center justify-center">
      <span
        aria-hidden
        className="success-ring absolute inset-0 rounded-full border-2"
        style={{ borderColor: "var(--ht-space-nebula-core)" }}
      />
      <span
        className="success-pop flex size-20 items-center justify-center rounded-full text-white"
        style={{ backgroundImage: CELEBRATORY_FILL }}
      >
        <Check className="size-10" strokeWidth={2.5} />
      </span>
    </span>
  );
}
