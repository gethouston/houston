import type { BillingChoice } from "@houston/engine-adapter";
import { nextChoiceDeadline } from "@houston/sdk";
import { useEffect, useState } from "react";

export function useChoiceNow(choice: BillingChoice | null | undefined): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const wait = nextChoiceDeadline(choice, Date.now());
      if (wait === null) return;
      id = setTimeout(
        () => {
          setNow(Date.now());
          arm();
        },
        Math.min(wait, 2 ** 31 - 1),
      );
    };
    setNow(Date.now());
    arm();
    return () => clearTimeout(id);
  }, [choice]);
  return now;
}
