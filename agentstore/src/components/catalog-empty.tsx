import { ArrowRight, Code2, Rocket, Upload } from "lucide-react";
import { agentSchemaUrl } from "@/lib/store-api-types";

/**
 * The deliberate pre-launch empty state for the home grid. The catalog starts
 * sparse, so instead of an apology this invites the first publishers and shows
 * both routes to get there.
 */
export function CatalogEmpty() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Rocket aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight text-balance">
        Be the first to publish an agent
      </h2>
      <p className="mt-3 max-w-md text-muted-foreground text-pretty">
        The store is brand new. Share an agent from Houston or post one over the
        API, and it will land right here for everyone to install.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href="https://gethouston.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Upload aria-hidden className="size-4" />
          Publish from Houston
        </a>
        <a
          href={agentSchemaUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Code2 aria-hidden className="size-4" />
          Publish over the API
          <ArrowRight aria-hidden className="size-4" />
        </a>
      </div>
    </div>
  );
}
