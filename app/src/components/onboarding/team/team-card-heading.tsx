/**
 * The opening screen's headline, set like the survey's (`survey-header.tsx`)
 * so the first run reads as one voice from the first question to the team.
 */
export function TeamCardHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="max-w-md text-balance text-sm text-ink-muted">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
