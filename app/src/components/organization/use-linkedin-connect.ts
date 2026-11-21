import { startLinkedInConnect } from "@houston/sdk/linkedin/connect-flow";
import { startLinkedInConnectWatch } from "@houston/sdk/linkedin/policy";
import {
  type Dispatch,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { linkedInConnectPorts } from "./linkedin-connect-ports";
import { createLinkedInGate } from "./org-chart-share-gate";
import type {
  ShareDialogAction,
  ShareDialogState,
} from "./org-chart-share-state";
import type { ConnectPhase } from "./org-chart-share-step";

export function useLinkedInConnect(input: {
  state: ShareDialogState;
  dispatch: Dispatch<ShareDialogAction>;
  session: RefObject<number>;
  connected: boolean;
  recheck: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation("teams");
  const { state, dispatch, session, connected, recheck } = input;
  const attempt = state.connect;
  const attempts = useRef(0);
  const [gate] = useState(() => createLinkedInGate(() => performance.now()));

  const opening = state.session;
  useEffect(() => {
    if (!attempt) return;
    const tag = { session: opening, attempt: attempt.id };
    if (connected) return dispatch({ type: "connectEnded", ...tag });
    const timer = setTimeout(
      () => dispatch({ type: "connectEnded", ...tag }),
      Math.max(0, attempt.watch.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [attempt, opening, connected, dispatch]);

  const connect = () => {
    gate(() => {
      const tag = { session: session.current, attempt: ++attempts.current };
      const ports = linkedInConnectPorts(t, i18n.resolvedLanguage);
      dispatch({
        type: "connecting",
        ...tag,
        watch: startLinkedInConnectWatch(Date.now()),
      });
      return startLinkedInConnect(ports).then(
        (landed) => {
          if (landed.kind === "opened")
            return dispatch({ type: "connectOpened", ...tag });
          dispatch({
            type: "connectEnded",
            ...tag,
            line:
              landed.kind === "blocked"
                ? { kind: "blocked", url: landed.url, channel: null }
                : undefined,
          });
        },
        () => {
          dispatch({ type: "connectEnded", ...tag });
          void recheck();
        },
      );
    });
  };

  const connectPhase: ConnectPhase = !attempt
    ? "idle"
    : attempt.minting
      ? "minting"
      : "waiting";

  return { connect, connectPhase };
}
