import type {
  BrowserLiveConnection,
  BrowserLiveConnectOptions,
  BrowserLiveHandlers,
} from "@houston/sdk";
import { runtimeScope } from "./chat-scope";
import type { BaseCtor } from "./mixin";

export function BrowserLiveMixin<TBase extends BaseCtor>(Base: TBase) {
  class BrowserLive extends Base {
    openBrowserLive(
      agentPath: string,
      conversationId: string,
      handlers: BrowserLiveHandlers,
      options?: BrowserLiveConnectOptions,
    ): BrowserLiveConnection {
      return this.ctx.sdk.browser.connect(
        conversationId,
        runtimeScope(this.ctx, agentPath),
        handlers,
        options,
      );
    }
  }
  return BrowserLive;
}
