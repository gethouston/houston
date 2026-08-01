import { ArrowRight, Code2, Rocket, Upload } from "lucide-react";

export function CatalogEmpty({
  publishHref,
  apiHref,
  labels = {},
}: {
  publishHref: string;
  apiHref: string;
  labels?: Partial<{
    title: string;
    description: string;
    publish: string;
    publishApi: string;
  }>;
}) {
  const text = {
    title: "Be the first to publish an agent",
    description:
      "The store is brand new. Share an agent from Houston or post one over the API, and it will land right here for everyone to install.",
    publish: "Publish from Houston",
    publishApi: "Publish over the API",
    ...labels,
  };
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-action/10 text-action">
        <Rocket aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight text-balance">
        {text.title}
      </h2>
      <p className="mt-3 max-w-md text-ink-muted text-pretty">
        {text.description}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href={publishHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-5 text-sm font-medium text-action-text transition-colors hover:bg-action/70 focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
        >
          <Upload aria-hidden className="size-4" />
          {text.publish}
        </a>
        <a
          href={apiHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-input px-5 text-sm font-medium text-ink transition-colors hover:bg-hover hover:text-hover-text focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
        >
          <Code2 aria-hidden className="size-4" />
          {text.publishApi}
          <ArrowRight aria-hidden className="size-4" />
        </a>
      </div>
    </div>
  );
}

export function FilteredEmpty({
  clearHref = "/",
  LinkComponent = (props) => <a {...props} />,
  labels = {},
}: {
  clearHref?: string;
  LinkComponent?: import("../types").StoreLinkComponent;
  labels?: Partial<{ title: string; description: string; clear: string }>;
}) {
  const text = {
    title: "No matches found",
    description: "Try another search or clear your filters.",
    clear: "Clear filters",
    ...labels,
  };
  return (
    <div className="rounded-[20px] bg-chip-subtle px-6 py-14 text-center">
      <h2 className="font-display text-xl font-semibold">{text.title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{text.description}</p>
      <LinkComponent
        href={clearHref}
        className="mt-5 inline-flex rounded-full bg-chip px-4 py-2 text-sm text-ink hover:bg-hover"
      >
        {text.clear}
      </LinkComponent>
    </div>
  );
}
