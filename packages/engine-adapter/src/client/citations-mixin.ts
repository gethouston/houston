import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * File comments riding a send. The draft list itself is SDK state the app
 * reads straight off `engineSdk.citations`; only the send's fold reaches the
 * wire, through the composer attachments route its crops upload on.
 */
export function CitationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Citations extends Base {
    /** Fold `draftKey`'s comments into `text`, uploading their crops. */
    async composeCitations(
      agentPath: string,
      draftKey: string,
      text: string,
    ): Promise<string> {
      const sdk = this.ctx.sdk;
      if (sdk.citations.list(draftKey).length === 0) return text;
      if (!this.ctx.cp) throw new Error("Attachments need a cloud workspace.");
      return viaSdk(`${controlPlane.agentPath(agentPath)}/attachments`, () =>
        sdk.citations.compose({ agentId: agentPath, draftKey, text }),
      );
    }
  }
  return Citations;
}
