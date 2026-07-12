import { useEffect, useRef, useState } from "react";

/** Owns the share toggle and clears it when the active workspace changes. */
export function useLocalModelShare(workspaceId: string) {
  const [shared, setShared] = useState(false);
  const previousWorkspaceId = useRef(workspaceId);
  useEffect(() => {
    if (previousWorkspaceId.current === workspaceId) return;
    previousWorkspaceId.current = workspaceId;
    setShared(false);
  }, [workspaceId]);
  return { shared, setShared };
}
