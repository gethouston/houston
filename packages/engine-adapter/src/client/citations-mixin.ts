import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function CitationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Citations extends Base {
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
