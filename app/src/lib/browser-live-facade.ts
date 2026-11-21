import type {
  BrowserLiveConnection,
  BrowserLiveConnectOptions,
  BrowserLiveHandlers,
} from "@houston/engine-adapter";
import { getEngine } from "./engine";

export const browserLive = {
  open(
    agentPath: string,
    conversationId: string,
    handlers: BrowserLiveHandlers,
    options?: BrowserLiveConnectOptions,
  ): BrowserLiveConnection {
    return getEngine().openBrowserLive(
      agentPath,
      conversationId,
      handlers,
      options,
    );
  },
};
