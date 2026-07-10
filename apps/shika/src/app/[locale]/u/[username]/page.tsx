import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {RecentIncidentFeed} from "@/components/features/status/recent-incident-feed";
import {StatusGranuleGrid} from "@/components/features/status/status-granule-grid";
import {LifeSectionCard} from "@/components/features/status/life-section-card";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {calculateSlaSnapshot} from "@/lib/domain/uptime";
import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import {
  getActiveIncidents,
  getActiveIncidentsBySection,
  getRecentIncidents,
  getSectionIncidentCount,
  getSectionsById,
  getUpcomingMaintenances,
} from "@/lib/domain/dashboard";
import {getMockUserSpaceData, mockUserSpaceData, shikanekoDemoRange} from "@/lib/mock";
import type {DailyStatusGranule, IncidentLifecycleStatus, IncidentSeverity} from "@/types";

const SECTION_GRANULE_DAYS = 30;
const YEAR_GRANULE_DAYS = 365;

type PageParams = Promise<{
  locale: string;
  username: string;
}>;

async function getValidatedParams(
  params: PageParams,
): Promise<{locale: AppLocale; username: string}> {
  const {locale, username} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return {locale, username};
}

export function generateStaticParams() {
  return mockUserSpaceData.map((space) => ({username: space.owner.username}));
}

export default async function UserSpaceHomePage({
  params,
}: {
  params: PageParams;
}) {
  const {locale, username} = await getValidatedParams(params);

  setRequestLocale(locale);

  const userSpace = getMockUserSpaceData(username);

  if (!userSpace) {
    notFound();
  }

  const t = await getTranslations({locale, namespace: "Home"});
  const tCommon = await getTranslations({locale, namespace: "IncidentCommon"});
  const {owner, lifeSections, incidents} = userSpace;
  const yearEndedAt = shikanekoDemoRange.endedAt;
  const yearEndDate = new Date(yearEndedAt);
  const yearStartDate = new Date(yearEndDate);
  yearStartDate.setUTCDate(yearStartDate.getUTCDate() - (YEAR_GRANULE_DAYS - 1));
  const yearGranuleStartDate = yearStartDate.toISOString().slice(0, 10) as `${number}-${number}-${number}`;
  const yearStartedAt = `${yearGranuleStartDate}T00:00:00.000Z`;
  const granules = buildDailyStatusGranules({
    incidents,
    startDate: yearGranuleStartDate,
    days: YEAR_GRANULE_DAYS,
  });
  const slaSnapshot = calculateSlaSnapshot({
    incidents,
    startedAt: yearStartedAt,
    endedAt: yearEndedAt,
    label: t("granules.rangeLabel"),
  });
  const activeIncidents = getActiveIncidents(incidents);
  const upcomingMaintenances = getUpcomingMaintenances(incidents);
  const recentIncidents = getRecentIncidents(incidents, 10);
  const sectionsById = getSectionsById(lifeSections);
  const incidentsById = Object.fromEntries(incidents.map((incident) => [incident.id, incident]));
  const orderedSections = [...lifeSections].sort((left, right) => left.order - right.order);
  const sectionGranuleDays = Math.min(SECTION_GRANULE_DAYS, granules.length);
  const sectionGranuleStartDate =
    granules.at(-sectionGranuleDays)?.date ?? userSpace.granules[0]?.date ?? shikanekoDemoRange.granuleStartDate;
  const severityLabels: Record<IncidentSeverity, string> = {
    normal: tCommon("severity.normal.label"),
    maintenance: tCommon("severity.maintenance.label"),
    notice: tCommon("severity.notice.label"),
    warning: tCommon("severity.warning.label"),
    critical: tCommon("severity.critical.label"),
  };
  const statusLabels: Record<IncidentLifecycleStatus, string> = {
    scheduled: tCommon("status.scheduled.label"),
    investigating: tCommon("status.investigating.label"),
    identified: tCommon("status.identified.label"),
    monitoring: tCommon("status.monitoring.label"),
    resolved: tCommon("status.resolved.label"),
  };
  const sectionGranulesById = Object.fromEntries(
    orderedSections.map((section) => [
      section.id,
      buildDailyStatusGranules({
        incidents,
        startDate: sectionGranuleStartDate,
        days: sectionGranuleDays,
        sectionId: section.id,
      }),
    ]),
  );
  const sectionSeverityById = Object.fromEntries(
    orderedSections.map((section) => {
      const latestGranule = sectionGranulesById[section.id]?.at(-1);

      return [
        section.id,
        (latestGranule?.highestSeverity ?? "normal") as IncidentSeverity,
      ];
    }),
  );
  const formatGranuleTitle = (granule: DailyStatusGranule) => {
    const relatedIncidents = granule.incidentIds
      .map((incidentId) => incidentsById[incidentId])
      .filter((incident) => incident !== undefined);
    const sectionNames = Array.from(
      new Set(
        relatedIncidents.map(
          (incident) => sectionsById[incident.sectionId]?.name ?? incident.sectionId,
        ),
      ),
    );
    const sectionList = sectionNames.join(locale.startsWith("zh") ? "、" : ", ");
    const incidentList = relatedIncidents
      .map((incident) => incident.title)
      .join(locale.startsWith("zh") ? "；" : "; ");

    return [
      granule.date,
      `${t("granules.tooltip.status")}: ${severityLabels[granule.highestSeverity]}`,
      `${t("granules.tooltip.availability")}: ${Math.round(granule.uptimeRatio * 100)}%`,
      sectionNames.length > 0
        ? `${t("granules.tooltip.sections")}: ${sectionList}`
        : `${t("granules.tooltip.sections")}: ${t("granules.tooltip.sectionsEmpty")}`,
      relatedIncidents.length > 0
        ? `${t("granules.tooltip.events")}: ${incidentList}`
        : `${t("granules.tooltip.events")}: ${t("granules.tooltip.eventsEmpty")}`,
    ].join("\n");
  };

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-14 py-14 md:gap-20 md:py-20">
        <section className="space-y-5 pt-8 md:pt-10">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            @{owner.username}
          </p>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {owner.displayName}
            </h1>
            <p className="text-lg text-foreground/85">{owner.headline}</p>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {owner.bio}
            </p>
          </div>
        </section>

        <section id="uptime" className="space-y-9 pt-4 md:pt-6">
          <SectionHeading
            kicker={t("granules.kicker")}
            title={t("granules.title")}
            description={t("granules.description")}
          />
          <StatusGranuleGrid
            granules={granules}
            getGranuleTitle={formatGranuleTitle}
            locale={locale}
          />
          <div className="space-y-6 border-t border-border/60 pt-8">
            <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-6">
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.uptime")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.uptimePercentage}%
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.steadyDays")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.healthyGranuleCount}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.activeEvents")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {activeIncidents.length}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.plannedMaintenance")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {upcomingMaintenances.length}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.impactMinutes")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.affectedMinutes}
                </div>
              </div>
              <div className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t("metrics.maintenanceMinutes")}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {slaSnapshot.maintenanceMinutes}
                </div>
              </div>
            </div>

            <div className="border-y border-border/70 px-5 py-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("metrics.recordedEvents")}
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {slaSnapshot.impactedIncidentIds.length}
              </div>
            </div>
          </div>
        </section>

        <section id="sections" className="space-y-9 pt-8 md:pt-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeading
              kicker={t("sections.kicker")}
              title={t("sections.title")}
              description={t("sections.description")}
              className="max-w-3xl"
            />
            <Link
              href={{
                pathname: "/u/[username]/sections",
                params: {username},
              }}
              className="inline-flex w-fit items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              {t("sections.viewAll")}
            </Link>
          </div>
          <div className="space-y-8">
            {orderedSections.map((section) => (
              <Link
                key={section.id}
                href={{
                  pathname: "/u/[username]/sections/[sectionSlug]",
                  params: {username, sectionSlug: section.slug},
                }}
                className="block transition hover:opacity-95"
              >
                <LifeSectionCard
                  section={section}
                  granules={sectionGranulesById[section.id] ?? []}
                  severityLabel={severityLabels[sectionSeverityById[section.id] ?? "normal"]}
                  getGranuleTitle={formatGranuleTitle}
                  locale={locale}
                  affectedIncidentCount={getSectionIncidentCount(section, incidents)}
                  activeIncidentCount={getActiveIncidentsBySection(section.id, incidents).length}
                  historyLabel={t("sections.historyLabel", {days: sectionGranuleDays})}
                  uptimeLabel={t("sections.uptimeLabel")}
                  incidentsLabel={t("sections.incidentsLabel")}
                  activeLabel={t("sections.activeLabel")}
                />
              </Link>
            ))}
          </div>
        </section>

        <section id="recent-events" className="space-y-9 pt-8 md:pt-10">
          <SectionHeading
            kicker={t("recentFeed.kicker")}
            title={t("recentFeed.title")}
            description={t("recentFeed.description")}
          />
          <RecentIncidentFeed
            incidents={recentIncidents}
            sectionsById={sectionsById}
            locale={locale}
            emptyLabel={t("recentFeed.empty")}
            detailLabel={tCommon("actions.viewIncident")}
            statusLabels={statusLabels}
            getIncidentHref={(incident) => ({
              pathname: "/u/[username]/events/[eventSlug]",
              params: {username, eventSlug: incident.slug},
            })}
          />
        </section>
      </main>
    </div>
  );
}
