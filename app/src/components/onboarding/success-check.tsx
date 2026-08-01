import { Check } from "lucide-react";

/**
 * The onboarding finished-screen "done" mark: a large filled circle with a check
 * that pops in, wrapped by an expanding ring. Its one and only caller is the
 * finished mission, so this is a single fixed success variant.
 */
export function SuccessCheck() {
  return (
    <span className="relative flex size-20 items-center justify-center">
      <span
        aria-hidden
        className="success-ring absolute inset-0 rounded-full border-2 border-success"
      />
      <span className="success-pop flex size-20 items-center justify-center rounded-full bg-success text-success-text">
        <Check className="size-10" strokeWidth={2.5} />
      </span>
    </span>
  );
}
