import { useEffect } from "react";
import { activeAccountUid } from "../lib/academy/academy-ports";
import { startUsageAccrual } from "../lib/academy/usage-live";
import { queryClient } from "../lib/query-client";
import { academyProgressKey } from "./use-academy-progress";

export function useUsageAccrual(): void {
  useEffect(
    () =>
      startUsageAccrual(activeAccountUid, (uid) => {
        void queryClient.invalidateQueries({
          queryKey: academyProgressKey(uid),
        });
      }),
    [],
  );
}
