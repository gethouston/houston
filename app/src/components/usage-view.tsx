import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart2, Zap, Layers, DollarSign, Clock, Cpu, ChevronDown, Info } from "lucide-react";
import { cn } from "@houston-ai/core";
import { useCostAnalytics, applyFilter } from "../hooks/use-cost-analytics";
import { aggregate, cacheHitPct } from "../lib/cost-aggregate";
import { BarChart } from "./usage-chart";
import { KpiCard, Section, DataBar, fmtTokens, fmtCost, shortModel } from "./usage-parts";

type FilterKind = "all" | "agent" | "model";
interface Filter { kind: FilterKind; value: string; label: string }
/** Selection identity, without a frozen label. The label is derived from the
 *  current options so it can't go stale on a language change or agent rename. */
type Selection = Pick<Filter, "kind" | "value">;

export function UsageView() {
  const { t } = useTranslation("shell");
  const data = useCostAnalytics();
  const [selection, setSelection] = useState<Selection>({ kind: "all", value: "" });
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filterOptions = useMemo<Filter[]>(() => {
    const opts: Filter[] = [{ kind: "all", value: "", label: t("usage.filterAll") }];
    for (const a of data.agents) opts.push({ kind: "agent", value: a.path, label: a.name });
    for (const m of data.models) opts.push({ kind: "model", value: m, label: shortModel(m) });
    return opts;
  }, [data.agents, data.models, t]);

  // A selected agent/model can disappear (deleted, or it had no sessions); fall
  // back to "all" so the view never shows a dangling filter.
  const filter = filterOptions.find((o) => o.kind === selection.kind && o.value === selection.value)
    ?? filterOptions[0];

  const metrics = useMemo(
    () => filter.kind === "all" ? data : aggregate(applyFilter(data.sessions, filter.kind, filter.value)),
    [data, filter],
  );

  if (data.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BarChart2 className="h-8 w-8 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">{t("usage.loading")}</p>
        </div>
      </div>
    );
  }

  if (data.totalSessions === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center max-w-xs">
          <BarChart2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">{t("usage.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("usage.emptySubtitle")}</p>
        </div>
      </div>
    );
  }

  const recentDays = metrics.byDay.slice(-14);
  const useTokensForDay = !metrics.hasCostData;
  const maxAgentTokens = Math.max(...metrics.byAgent.map((a) => a.totalTokens), 1);
  const maxModelTokens = Math.max(...metrics.byModel.map((m) => m.totalTokens), 1);

  return (
    <div className="h-full overflow-y-auto">
      {dropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-normal text-foreground">{t("usage.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("usage.subtitle")}</p>
          </div>
          {filterOptions.length > 1 && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={filter.label}
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((o) => !o)}
                className={cn("flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary", dropdownOpen && "border-foreground/30")}
              >
                {filter.kind !== "all" && <span className="text-xs text-muted-foreground">{filter.kind === "agent" ? t("usage.filterAgent") : t("usage.filterModel")}:</span>}
                <span className="max-w-[160px] truncate">{filter.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
              </button>
              {dropdownOpen && (
                <div role="listbox" className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-border bg-card shadow-lg py-1 text-sm">
                  {filterOptions.map((opt) => (
                    <button
                      type="button"
                      key={`${opt.kind}-${opt.value}`}
                      role="option"
                      aria-selected={opt.kind === filter.kind && opt.value === filter.value}
                      onClick={() => { setSelection({ kind: opt.kind, value: opt.value }); setDropdownOpen(false); }}
                      className={cn("w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-secondary transition-colors", opt.kind === filter.kind && opt.value === filter.value && "bg-secondary font-medium")}
                    >
                      {opt.kind !== "all" && <span className="text-xs text-muted-foreground w-12 shrink-0">{opt.kind === "agent" ? t("usage.filterAgent") : t("usage.filterModel")}</span>}
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.hasCostData
            ? <KpiCard icon={<DollarSign className="h-3.5 w-3.5" />} label={t("usage.totalSpend")} value={fmtCost(metrics.totalCost)} />
            : <KpiCard icon={<Cpu className="h-3.5 w-3.5" />} label={t("usage.totalTokens")} value={fmtTokens(metrics.totalTokens)} />}
          <KpiCard icon={<Layers className="h-3.5 w-3.5" />} label={t("usage.totalSessions")} value={String(metrics.totalSessions)} />
          <KpiCard icon={<Zap className="h-3.5 w-3.5" />} label={t("usage.cacheEfficiency")} value={`${metrics.cacheEfficiencyPct}%`} />
          {metrics.hasCostData
            ? <KpiCard icon={<Clock className="h-3.5 w-3.5" />} label={t("usage.avgCostPerSession")} value={metrics.totalSessions > 0 ? fmtCost(metrics.totalCost / metrics.totalSessions) : "$0.00"} />
            : <KpiCard icon={<Clock className="h-3.5 w-3.5" />} label={t("usage.cachedTokens")} value={fmtTokens(metrics.cachedTokens)} />}
        </div>

        {metrics.hasCostData && (
          <div className="grid grid-cols-2 gap-3">
            <KpiCard icon={<Cpu className="h-3.5 w-3.5" />} label={t("usage.totalTokens")} value={fmtTokens(metrics.totalTokens)} />
            <KpiCard icon={<Clock className="h-3.5 w-3.5" />} label={t("usage.cachedTokens")} value={`${fmtTokens(metrics.cachedTokens)} (${metrics.cacheEfficiencyPct}%)`} />
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{t("usage.dataNote")}</span>
        </div>

        {metrics.byModel.length > 0 && (
          <Section title={t("usage.byModel")}>
            <div className="space-y-3">
              {metrics.byModel.map((m) => (
                <div key={m.model} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs font-medium truncate max-w-[55%]">{m.model}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span>{t("usage.sessions", { count: m.sessionCount })}</span>
                      <span className="font-medium text-foreground">{fmtTokens(m.totalTokens)} {t("usage.tokens")}</span>
                      {m.hasCost && m.totalCost > 0 && <span>{fmtCost(m.totalCost)}</span>}
                    </div>
                  </div>
                  <DataBar pct={(m.totalTokens / maxModelTokens) * 100} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {metrics.byAgent.length > 1 && (
          <Section title={t("usage.byAgent")}>
            <div className="space-y-3">
              {metrics.byAgent.map((agent) => (
                <div key={agent.agentPath} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[55%]">{agent.agentName}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span>{t("usage.sessions", { count: agent.sessionCount })}</span>
                      <span className="font-medium text-foreground">{fmtTokens(agent.totalTokens)} {t("usage.tokens")}</span>
                      {agent.hasCost && agent.totalCost > 0 && <span>{fmtCost(agent.totalCost)}</span>}
                    </div>
                  </div>
                  <DataBar pct={(agent.totalTokens / maxAgentTokens) * 100} />
                  {agent.contextTokens > 0 && (
                    <p className="text-[11px] text-muted-foreground">{t("usage.cacheHit", { pct: cacheHitPct(agent.cachedTokens, agent.contextTokens) })}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {recentDays.length > 1 && (
          <Section title={t("usage.dailyTrend")}>
            <BarChart
              values={recentDays.map((d) => useTokensForDay ? d.tokens : d.cost)}
              xLabels={recentDays.map((d, i) => i === 0 || i === recentDays.length - 1 || i % 3 === 0 ? d.date.slice(5) : null)}
              tooltips={recentDays.map((d) => useTokensForDay ? `${d.date.slice(5)}: ${fmtTokens(d.tokens)} ${t("usage.tokens")}` : `${d.date.slice(5)}: ${fmtCost(d.cost)}`)}
              caption={useTokensForDay ? t("usage.captionByDay") : t("usage.captionByDayCost")}
            />
          </Section>
        )}

        {metrics.byHour.some((h) => h.tokens > 0) && (
          <Section title={t("usage.byHour")}>
            <BarChart
              values={metrics.byHour.map((h) => h.tokens)}
              xLabels={metrics.byHour.map((h) => h.hour % 6 === 0 ? `${String(h.hour).padStart(2, "0")}h` : null)}
              tooltips={metrics.byHour.map((h) => { const l = `${String(h.hour).padStart(2, "0")}h`; return h.tokens > 0 ? `${l}: ${fmtTokens(h.tokens)} (${h.sessions}s)` : l; })}
              caption={t("usage.captionByHour")}
            />
          </Section>
        )}

      </div>
    </div>
  );
}
