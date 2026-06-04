/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Hosts the four variants over ONE shared Recurrence model, behind a ?variant=
 * param. Switching variants keeps the schedule, so the user compares pure UI.
 * See ./NOTES.md for the question, the research, and the per-variant verdict.
 */
import { useState, type ComponentType } from "react"
import type { Recurrence } from "./cron"
import { DEFAULT_RECURRENCE } from "./cron"
import { Frame } from "./frame"
import { Switcher, type VariantMeta } from "./switcher"
import { VariantA } from "./variant-a"
import { VariantE } from "./variant-e"
import { VariantF } from "./variant-f"
import { VariantG } from "./variant-g"

type VariantProps = { rec: Recurrence; onChange: (p: Partial<Recurrence>) => void }

// Round 2: keep A (the "Repeat every…" baseline the user liked) and add three
// refined takes of it (full-name "Repeat on" day buttons, unit dropdown),
// grounded in Notion / Apple / Google. B, C, D from round 1 were dropped.
const VARIANTS: (VariantMeta & { reference: string; Component: ComponentType<VariantProps> })[] = [
  { key: "A", name: "Repeat-every (baseline)", reference: "Google / Outlook", Component: VariantA },
  { key: "E", name: "Notion Calendar", reference: "Notion / Cron", Component: VariantE },
  { key: "F", name: "Apple Calendar", reference: "Apple iOS / macOS", Component: VariantF },
  { key: "G", name: "Houston refined", reference: "production candidate", Component: VariantG },
]

function readVariant(): string {
  const key = new URLSearchParams(window.location.search).get("variant")?.toUpperCase()
  return VARIANTS.some((v) => v.key === key) ? (key as string) : "A"
}

export function PrototypeApp() {
  const [current, setCurrent] = useState(readVariant)
  const [rec, setRec] = useState<Recurrence>(DEFAULT_RECURRENCE)

  const onChange = (patch: Partial<Recurrence>) => setRec((prev) => ({ ...prev, ...patch }))

  const select = (key: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("variant", key)
    window.history.replaceState(null, "", url)
    setCurrent(key)
  }

  const active = VARIANTS.find((v) => v.key === current) ?? VARIANTS[0]
  const Active = active.Component

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <Frame variantKey={active.key} variantName={active.name} reference={active.reference} rec={rec}>
        <Active rec={rec} onChange={onChange} />
      </Frame>
      <Switcher variants={VARIANTS} current={current} onSelect={select} />
    </div>
  )
}
