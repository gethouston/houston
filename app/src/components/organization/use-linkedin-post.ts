import { startLinkedInConnect } from "@houston/sdk/linkedin/connect-flow";
import {
  type LinkedInRefusalAction,
  linkedInRefusalAction,
  startLinkedInConnectWatch,
} from "@houston/sdk/linkedin/policy";
import {
  type Dispatch,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  useLinkedInActions,
  useLinkedInConnection,
} from "../../hooks/queries/use-linkedin";
import { useSession } from "../../hooks/use-session";
import { logAndReportError } from "../../lib/error-report";
import { showConnectivityErrorToast } from "../../lib/error-toast";
import { SESSION_QUERY_KEY, type Session } from "../../lib/identity";
import { tauriLinkedIn } from "../../lib/linkedin-facade";
import { queryClient } from "../../lib/query-client";
import { useWorkspaceStore } from "../../stores/workspaces";
import { linkedInConnectPorts } from "./linkedin-connect-ports";
import { LinkedInPostRefusedError, refusalLine } from "./linkedin-post-refusal";
import { runLinkedInPost } from "./linkedin-post-run";
import {
  isPostHeld,
  linkedInPostKey,
  useLinkedInPostSlot,
  useLinkedInPosts,
} from "./linkedin-post-store";
import { jpegOf, postableImage } from "./org-chart-share-encode";
import { createLinkedInGate } from "./org-chart-share-gate";
import type {
  ShareDialogAction,
  ShareDialogState,
} from "./org-chart-share-state";
import { type ConnectPhase, connectionRead } from "./org-chart-share-step";

/** Who is signed in now, read when a post's step lands, not at render. */
const signedIn = () =>
  queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY)?.uid ?? null;

/**
 * Posting from the share dialog: the connection read (polled while a connect
 * is under way), Connect LinkedIn, Post to LinkedIn and Disconnect. A connect
 * writes only into the opening and attempt it started in. A post is claimed
 * and settled in the space's slot (`linkedin-post-store.ts`), which outlives
 * this page; the dialog on screen shows its result.
 */
export function useLinkedInPost(input: {
  enabled: boolean;
  state: ShareDialogState;
  dispatch: Dispatch<ShareDialogAction>;
  session: RefObject<number>;
  onPosted: () => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const { enabled, state, dispatch, session } = input;
  // One post out per person and space, held outside the page that started it.
  const uid = useSession().data?.uid ?? null;
  const space = useWorkspaceStore((s) => s.current?.id ?? "");
  const postKey = linkedInPostKey(uid, space);
  const slot = useLinkedInPostSlot(postKey);
  const attempt = state.connect;
  const query = useLinkedInConnection(enabled, attempt?.watch ?? null);
  const actions = useLinkedInActions();
  const attempts = useRef(0);
  // A double click minted two states, and the gateway keeps only the last:
  // the first tab then failed. Checked before the click claims a tab.
  const [gate] = useState(() => createLinkedInGate(() => performance.now()));

  // A post that went up, here or while this page was gone, is said once by
  // the opening on screen; one that may be up, by every opening until the
  // person checked. Before paint, so Post never flashes back.
  const { landed, unconfirmed } = slot;
  const saidUnconfirmed = state.line?.kind === "unconfirmed";
  useLayoutEffect(() => {
    if (!state.open) return;
    if (landed !== null) {
      dispatch({ type: "posted", postUrl: landed });
      useLinkedInPosts.getState().shown(postKey);
    } else if (unconfirmed && !saidUnconfirmed) {
      dispatch({ type: "postUnconfirmed" });
    }
  }, [state.open, landed, unconfirmed, saidUnconfirmed, postKey, dispatch]);

  // The attempt ends when the connection lands or its window closes.
  const connected = query.data?.connected === true;
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

  // Inside the click: a browser only grants LinkedIn's tab there. Starting
  // over is the same click: a new attempt, whose state replaces the old one
  // at the gateway, and the old attempt's results are dropped.
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
        // tauriLinkedIn.connect already reported it (or silenced a deployment
        // with no LinkedIn); the connect is simply over.
        () => {
          dispatch({ type: "connectEnded", ...tag });
          void actions.recheck();
        },
      );
    });
  };

  const refused = (action: LinkedInRefusalAction, retryAfterMs?: number) => {
    if (action === "reconnect") actions.markDisconnected();
    if (action === "fallback") void actions.recheck();
    if (action === "offline")
      showConnectivityErrorToast("linkedin_post", "LinkedIn post: offline");
    dispatch({ type: "postRefused", line: refusalLine(action, retryAfterMs) });
  };

  const post = async (file: File, text: string, altText: string) => {
    const claim = useLinkedInPosts.getState().start(uid, space);
    if (!claim) return;
    dispatch({ type: "posting" });
    const outcome = await runLinkedInPost(claim, {
      signedIn,
      prepare: () =>
        postableImage(file, jpegOf).catch((error: unknown) => {
          logAndReportError("org_chart_share_encode", error);
          throw error;
        }),
      // tauriLinkedIn.postImage reports a failure that is not a refusal.
      send: (image) => tauriLinkedIn.postImage({ image, text, altText }),
    });
    // Signed out or in meanwhile: nothing of it reaches the next person.
    if (!outcome || outcome.kind === "unconfirmed") return;
    if (outcome.kind === "failed") return refused("quiet");
    if (outcome.kind === "posted") return input.onPosted();
    const action = linkedInRefusalAction(outcome.code);
    if (action === "report")
      logAndReportError(
        "linkedin_post",
        new LinkedInPostRefusedError(`LinkedIn post refused: ${outcome.code}`),
      );
    refused(action, outcome.retryAfterMs);
  };

  const connectPhase: ConnectPhase = !attempt
    ? "idle"
    : attempt.minting
      ? "minting"
      : "waiting";

  return {
    connection: connectionRead(query),
    connectPhase,
    connect,
    post,
    posting: slot.posting,
    /** A post that may be up waits for the person to check LinkedIn. */
    held: isPostHeld(slot),
    dismissUnconfirmed: () => {
      useLinkedInPosts.getState().dismissUnconfirmed(postKey);
      dispatch({ type: "unconfirmedDismissed" });
    },
    disconnect: () => actions.disconnect.mutate(),
    disconnecting: actions.disconnect.isPending,
  };
}
