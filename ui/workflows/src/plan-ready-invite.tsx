/**
 * PlanReadyInvite — chat nudge after inline workflow planning finishes.
 */
export interface PlanReadyInviteLabels {
  title: string
  description: string
}

export function PlanReadyInvite({ labels }: { labels: PlanReadyInviteLabels }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1">
      <p className="text-sm font-medium text-foreground">{labels.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {labels.description}
      </p>
    </div>
  )
}
