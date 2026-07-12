import { ArrowRight, Code2, Upload } from "lucide-react";
import { agentSchemaUrl } from "@/lib/store-api-types";

/**
 * The two supported publish routes, anchored at #publish (the header "Publish"
 * link targets it): sharing straight from the Houston desktop app, and the
 * agent-native REST path where a tool POSTs an AgentIR document.
 */
export function PublishPaths() {
  return (
    <section id="publish" className="scroll-mt-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Two ways to publish
        </h2>
        <p className="mt-3 text-muted-foreground text-pretty">
          Whether you build in the Houston app or your agent posts on its own,
          every agent gets its own page and a shareable link.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Upload aria-hidden className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold">
              Publish from Houston
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Build an agent in the Houston desktop app, then share it in one
              step. No code, no terminal. Edit or unpublish it anytime from your
              signed-in account.
            </p>
          </div>
          <a
            href="https://gethouston.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Get Houston
            <ArrowRight aria-hidden className="size-4" />
          </a>
        </article>

        <article className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Code2 aria-hidden className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold">
              Publish over the API
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Agents and tools can publish directly by posting an AgentIR
              document to the store. The response returns the new page URL and a
              claim link, so you can claim the agent into your account to manage
              it.
            </p>
            <code className="mt-3 inline-block rounded-lg bg-secondary px-3 py-1.5 font-mono text-xs text-secondary-foreground">
              POST /v1/agentstore/agents
            </code>
          </div>
          <a
            href={agentSchemaUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            View the AgentIR schema
            <ArrowRight aria-hidden className="size-4" />
          </a>
        </article>
      </div>
    </section>
  );
}
