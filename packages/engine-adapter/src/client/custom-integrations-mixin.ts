import type * as controlPlane from "../control-plane";
import { updateDetails } from "./custom-details";
import {
  agentCustomPath,
  customPath,
  whenServed,
  whenSlugKnown,
} from "./custom-routes";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function CustomIntegrationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class CustomIntegrations extends Base {
    updateCustomIntegrationDetails(
      slug: string,
      details: { name: string; website: string },
      agentId?: string,
    ): Promise<void> {
      return updateDetails(this.ctx, slug, details, agentId);
    }
    async customIntegrations(): Promise<
      controlPlane.CustomIntegrationView[] | null
    > {
      if (!this.ctx.cp) return null;
      return whenServed(() =>
        viaSdk(customPath("definitions"), () =>
          this.ctx.sdk.integrations.custom.list(),
        ),
      );
    }
    async removeCustomIntegration(slug: string): Promise<void> {
      this.requireHost();
      await viaSdk(customPath("definitions", slug), () =>
        this.ctx.sdk.integrations.custom.remove(slug),
      );
    }
    async submitCustomIntegrationCredential(
      slug: string,
      values: Record<string, string>,
    ): Promise<controlPlane.CustomIntegrationView> {
      this.requireHost();
      return viaSdk(customPath("definitions", slug, "credential"), () =>
        this.ctx.sdk.integrations.custom.submitCredential(slug, values),
      );
    }
    async detectCustomIntegration(
      url: string,
    ): Promise<controlPlane.CustomDetectResult> {
      this.requireHost();
      return viaSdk(customPath("detect"), () =>
        this.ctx.sdk.integrations.custom.detect(url),
      );
    }
    async startCustomIntegrationOAuth(
      slug: string,
    ): Promise<{ authorizeUrl: string }> {
      this.requireHost();
      return viaSdk(customPath("definitions", slug, "oauth", "start"), () =>
        this.ctx.sdk.integrations.custom.startOAuth(slug),
      );
    }
    async addCustomIntegration(
      input: controlPlane.AddCustomIntegrationInput,
    ): Promise<controlPlane.CustomIntegrationView> {
      this.requireHost();
      return viaSdk(customPath("definitions"), () =>
        this.ctx.sdk.integrations.custom.add(input),
      );
    }
    async customIntegrationTools(
      slug: string,
    ): Promise<controlPlane.CustomToolInfo[] | null> {
      if (!this.ctx.cp) return null;
      return whenSlugKnown(() =>
        viaSdk(customPath("definitions", slug, "tools"), () =>
          this.ctx.sdk.integrations.custom.tools(slug),
        ),
      );
    }

    agentCustomIntegrations(
      agentSlugOrId: string,
    ): Promise<controlPlane.CustomIntegrationView[] | null> {
      return whenServed(() =>
        viaSdk(agentCustomPath(agentSlugOrId, "definitions"), () =>
          this.ctx.sdk.integrations.agentCustom.list(agentSlugOrId),
        ),
      );
    }
    submitAgentCustomIntegrationCredential(
      agentSlugOrId: string,
      slug: string,
      values: Record<string, string>,
    ): Promise<controlPlane.CustomIntegrationView> {
      return viaSdk(
        agentCustomPath(agentSlugOrId, "definitions", slug, "credential"),
        () =>
          this.ctx.sdk.integrations.agentCustom.submitCredential(
            agentSlugOrId,
            slug,
            values,
          ),
      );
    }
    detectAgentCustomIntegration(
      agentSlugOrId: string,
      url: string,
    ): Promise<controlPlane.CustomDetectResult> {
      return viaSdk(agentCustomPath(agentSlugOrId, "detect"), () =>
        this.ctx.sdk.integrations.agentCustom.detect(agentSlugOrId, url),
      );
    }
    startAgentCustomIntegrationOAuth(
      agentSlugOrId: string,
      slug: string,
    ): Promise<{ authorizeUrl: string }> {
      return viaSdk(
        agentCustomPath(agentSlugOrId, "definitions", slug, "oauth", "start"),
        () =>
          this.ctx.sdk.integrations.agentCustom.startOAuth(agentSlugOrId, slug),
      );
    }
    addAgentCustomIntegration(
      agentSlugOrId: string,
      input: controlPlane.AddCustomIntegrationInput,
    ): Promise<controlPlane.CustomIntegrationView> {
      return viaSdk(agentCustomPath(agentSlugOrId, "definitions"), () =>
        this.ctx.sdk.integrations.agentCustom.add(agentSlugOrId, input),
      );
    }
    async removeAgentCustomIntegration(
      agentSlugOrId: string,
      slug: string,
    ): Promise<void> {
      await viaSdk(agentCustomPath(agentSlugOrId, "definitions", slug), () =>
        this.ctx.sdk.integrations.agentCustom.remove(agentSlugOrId, slug),
      );
    }
    agentCustomIntegrationTools(
      agentSlugOrId: string,
      slug: string,
    ): Promise<controlPlane.CustomToolInfo[] | null> {
      return whenSlugKnown(() =>
        viaSdk(
          agentCustomPath(agentSlugOrId, "definitions", slug, "tools"),
          () =>
            this.ctx.sdk.integrations.agentCustom.tools(agentSlugOrId, slug),
        ),
      );
    }

    private requireHost(): void {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
    }
  }
  return CustomIntegrations;
}
