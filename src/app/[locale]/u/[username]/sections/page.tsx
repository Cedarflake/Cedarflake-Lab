import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {LifeSectionCard} from "@/components/features/status/life-section-card";
import {HistoryBackButton} from "@/components/ui/history-back-button";
import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {
  getActiveIncidentsBySection,
  getSectionIncidentCount,
  getSectionsById,
} from "@/lib/domain/dashboard";
import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import {getMockUserSpaceData, mockUserSpaceData, shikanekoDemoRange} from "@/lib/mock";
import type {DailyStatusGranule, IncidentSeverity} from "@/types";

const SECTION_GRANULE_DAYS = 30;

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

export default async function UserSectionsIndexPage({
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
  const {lifeSections, incidents, granules} = userSpace;
  const incidentsById = Object.fromEntries(incidents.map((incident) => [incident.id, incident]));
  const sectionsById = getSectionsById(lifeSections);
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

      return [section.id, (latestGranule?.highestSeverity ?? "normal") as IncidentSeverity];
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
      <main className="page-container flex flex-col gap-12 py-14 md:gap-16 md:py-20">
        <HistoryBackButton
          fallbackHref={{
            pathname: "/u/[username]",
            params: {username},
          }}
        />

        <section className="space-y-9 pt-4 md:pt-5">
          <SectionHeading
            kicker={t("sections.kicker")}
            title={t("sections.title")}
            description={t("sections.description")}
          />

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
      </main>
    </div>
  );
}
