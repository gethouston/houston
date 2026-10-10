import { useEffect, useState } from "react";
import { channelLinkExpired } from "../../../lib/channel-link-expiry";

export function useChannelLinkExpired(expiresAt: string): boolean {
  const [expired, setExpired] = useState(channelLinkExpired(expiresAt));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const nowExpired = channelLinkExpired(expiresAt);
      setExpired(nowExpired);
      if (!nowExpired) {
        timer = setTimeout(
          refresh,
          Math.min(60_000, Date.parse(expiresAt) - Date.now()),
        );
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [expiresAt]);
  return expired;
}
