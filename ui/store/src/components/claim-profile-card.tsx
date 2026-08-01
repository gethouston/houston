import type { StoreLinkComponent } from "../types";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;

export interface ClaimProfileCardLabels {
  title: string;
  body: string;
  cta: string;
}

export const CLAIM_PROFILE_CARD_LABELS: ClaimProfileCardLabels = {
  title: "Create your creator profile",
  body: "Claim a handle so people can find you and all the agents you publish.",
  cta: "Claim your handle",
};

/**
 * The owner's no-profile state: one card inviting the handle claim. Shared so
 * its copy cannot drift between the website and the app.
 */
export function ClaimProfileCard({
  editHref,
  labels: overrides,
  LinkComponent = PlainLink,
}: {
  editHref: string;
  labels?: Partial<ClaimProfileCardLabels>;
  LinkComponent?: StoreLinkComponent;
}) {
  const labels = { ...CLAIM_PROFILE_CARD_LABELS, ...overrides };
  return (
    <header className="rounded-2xl bg-chip-subtle p-6">
      <h1 className="font-semibold text-[28px] tracking-tight">
        {labels.title}
      </h1>
      <p className="mt-2 max-w-[55ch] text-ink-muted">{labels.body}</p>
      <LinkComponent
        href={editHref}
        className="mt-5 inline-flex items-center rounded-full bg-action px-4 py-2 font-medium text-action-text text-sm transition-opacity duration-150 hover:opacity-90"
      >
        {labels.cta}
      </LinkComponent>
    </header>
  );
}
