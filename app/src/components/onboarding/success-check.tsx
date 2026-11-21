import { Check } from "lucide-react";

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
