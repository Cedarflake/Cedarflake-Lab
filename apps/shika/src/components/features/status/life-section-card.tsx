import type {DailyStatusGranule, LifeSection} from "@/types";

import {StatusGranuleStrip} from "@/components/features/status/status-granule-strip";

export function LifeSectionCard({
  section,
  granules,
  severityLabel,
  getGranuleTitle,
  locale,
  affectedIncidentCount,
  activeIncidentCount,
  uptimeLabel,
  historyLabel,
  incidentsLabel,
  activeLabel,
}: {
  section: LifeSection;
  granules: DailyStatusGranule[];
  severityLabel: string;
  getGranuleTitle?: (granule: DailyStatusGranule) => string;
  locale?: string;
  affectedIncidentCount: number;
  activeIncidentCount: number;
  uptimeLabel: string;
  historyLabel: string;
  incidentsLabel: string;
  activeLabel: string;
}) {
  const averageUptimeRatio =
    granules.reduce((sum, granule) => sum + granule.uptimeRatio, 0) /
    Math.max(granules.length, 1);

  return (
    <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,1fr)_auto] lg:items-center lg:px-6 lg:py-7">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-lg font-semibold tracking-tight text-foreground">
            {section.name}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{section.description}</p>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <MetaLine label={section.category} value={severityLabel} />
          <MetaLine label={incidentsLabel} value={String(affectedIncidentCount)} />
          <MetaLine label={activeLabel} value={String(activeIncidentCount)} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {historyLabel}
        </div>
        <StatusGranuleStrip
          granules={granules}
          compact
          getGranuleTitle={getGranuleTitle}
          locale={locale}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {uptimeLabel}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {(averageUptimeRatio * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaLine({label, value}: {label: string; value: string}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
