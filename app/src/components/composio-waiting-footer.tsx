import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChatStatusLine } from "@houston-ai/chat";
import { useConnectedToolkits, useConnections } from "../hooks/queries";
import {
  extractComposioToolkits,
  isWaitingForToolkits,
} from "./composio-waiting";

/**
 * The end-of-message "Waiting for you to connect" line (issue #412).
 *
 * The inline `ComposioLinkCard` sits wherever the agent dropped the connect
 * link, which can be mid-sentence. The hand-off prompt, though, belongs at the
 * very bottom of the message so it reads as the agent's closing "your move",
 * regardless of where the link landed. This component renders that line,
 * lifted out of the card.
 *
 * It owns the live connection status itself (the same queries the card
 * watches, deduped by TanStack), so it clears the instant every linked
 * integration connects, independent of Streamdown's block memoization.
 */
function ComposioWaitingFooter({ toolkits }: { toolkits: string[] }) {
  const { t } = useTranslation("chat");
  const { data: status } = useConnections();
  const isSignedIn = status?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connected = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );
  if (!isWaitingForToolkits(toolkits, connected)) return null;
  // Render like `ChatProcessBlock`'s "Mission log" line: a bare ChatStatusLine,
  // flush with the message's left edge (no `px-1` indent), in the same muted
  // color. `mt-2` adds to `MessageContent`'s `gap-2` so the line sits clearly
  // below the message body. Standalone mission-log rows breathe inside the
  // feed's `gap-8` flow; this footer lives inside the message bubble, so it
  // needs the explicit top margin to read the same.
  return (
    <ChatStatusLine
      label={t("composio.waitingToConnect")}
      active
      className="mt-2 text-muted-foreground/65"
    />
  );
}

/**
 * Append the Composio waiting-to-connect footer to a `transformContent`
 * result when the assistant message links any integration.
 *
 * Composes with each chat surface's own content transform (marker stripping,
 * etc.): it keeps the incoming `content` + `extra` and just tacks the footer
 * on after `extra`. A message that links no integration is returned untouched
 * (no footer mounted, so unrelated messages never subscribe to the connection
 * queries), which makes this safe to wrap around every assistant message.
 */
export function withComposioWaitingFooter(result: {
  content: string;
  extra?: ReactNode;
}): { content: string; extra?: ReactNode } {
  const toolkits = extractComposioToolkits(result.content);
  if (toolkits.length === 0) return result;
  return {
    content: result.content,
    extra: (
      <>
        {result.extra}
        <ComposioWaitingFooter toolkits={toolkits} />
      </>
    ),
  };
}
