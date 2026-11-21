import { useEffect, useRef } from "react";
import { showErrorToast } from "../lib/error-toast";
import { nextErrorToastState } from "./query-error-toast-state.ts";

export function useQueryErrorToast(
  isFailure: boolean,
  errorIdentity: unknown,
  tag: string,
  message: string,
): void {
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const { shouldToast, reported: next } = nextErrorToastState(
      reported.current,
      isFailure,
      errorIdentity,
    );
    reported.current = next;
    if (shouldToast)
      showErrorToast(tag, message, errorIdentity, { userMessage: message });
  }, [isFailure, errorIdentity, tag, message]);
}
