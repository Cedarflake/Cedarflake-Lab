import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {IncidentListItem} from "@/components/features/status/incident-list-item";
import {HistoryBackButton} from "@/components/ui/history-back-button";
import {SectionHeading} from "@/components/ui/section-heading";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {
  getActiveIncidentsBySection,
  getIncidentsBySection,
  getResolvedIncidentsBySection,
  getSectionBySlug,
  getSectionsById,
  getUpcomingMaintenancesBySection,
} from "@/lib/domain/dashboard";
import {formatDateRange, formatDateTime, formatDurationMinutes} from "@/lib/formatters";
import {getMockUserSpaceData, mockUserSpaceData} from "@/lib/mock";
import type {
  IncidentLifecycleStatus,
  IncidentSeverity,
  Visibility,
} from "@/types";

type PageParams = Promise<{
  locale: string;
  username: string;
  sectionSlug: string;
}>;

async function getValidatedParams(
  params: PageParams,
): Promise<{locale: AppLocale; username: string; sectionSlug: string}> {
  const {locale, username, sectionSlug} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return {locale, username, sectionSlug};
}

export function generateStaticParams() {
  return mockUserSpaceData.flatMap((space) =>
    space.lifeSections.map((section) => ({
      username: space.owner.username,
      sectionSlug: section.slug,
    })),
  );
}

export default async function UserSectionIncidentPage({
  params,
}: {
  params: PageParams;
}) {
  const {locale, username, sectionSlug} = await getValidatedParams(params);

  setRequestLocale(locale);

  const userSpace = getMockUserSpaceData(username);

  if (!userSpace) {
    notFound();
  }

  const [t, tCommon] = await Promise.all([
    getTranslations({locale, namespace: "SectionPage"}),
    getTranslations({locale, namespace: "IncidentCommon"}),
  ]);

  const severityCopy: Record<
    IncidentSeverity,
    {label: string; description: string}
  > = {
    normal: {
      label: tCommon("severity.normal.label"),
      description: tCommon("severity.normal.description"),
    },
    maintenance: {
      label: tCommon("severity.maintenance.label"),
      description: tCommon("severity.maintenance.description"),
    },
    notice: {
      label: tCommon("severity.notice.label"),
      description: tCommon("severity.notice.description"),
    },
    warning: {
      label: tCommon("severity.warning.label"),
      description: tCommon("severity.warning.description"),
    },
    critical: {
      label: tCommon("severity.critical.label"),
      description: tCommon("severity.critical.description"),
    },
  };
  const statusCopy: Record<IncidentLifecycleStatus, {label: string}> = {
    scheduled: {label: tCommon("status.scheduled.label")},
    investigating: {label: tCommon("status.investigating.label")},
    identified: {label: tCommon("status.identified.label")},
    monitoring: {label: tCommon("status.monitoring.label")},
    resolved: {label: tCommon("status.resolved.label")},
  };
  const visibilityCopy: Record<Visibility, {label: string}> = {
    public: {label: tCommon("visibility.public.label")},
    authenticated: {label: tCommon("visibility.authenticated.label")},
    private: {label: tCommon("visibility.private.label")},
  };

  const {incidents, lifeSections} = userSpace;
  const section = getSectionBySlug(lifeSections, sectionSlug);

  if (!section) {
    notFound();
  }

  const sectionsById = getSectionsById(lifeSections);
  const allSectionIncidents = getIncidentsBySection(section.id, incidents);
  const activeIncidents = getActiveIncidentsBySection(section.id, incidents);
  const scheduledIncidents = getUpcomingMaintenancesBySection(section.id, incidents);
  const resolvedIncidents = getResolvedIncidentsBySection(section.id, incidents);

  const metrics = [
    {label: t("metrics.total"), value: allSectionIncidents.length},
    {label: t("metrics.active"), value: activeIncidents.length},
    {label: t("metrics.scheduled"), value: scheduledIncidents.length},
    {label: t("metrics.resolved"), value: resolvedIncidents.length},
  ];

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-12 py-14 md:gap-16 md:py-20">
        <section className="space-y-8">
          <HistoryBackButton
            fallbackHref={{
              pathname: "/u/[username]/sections",
              params: {username},
            }}
          />

          <SectionHeading
            kicker={t("hero.kicker")}
            title={section.name}
            description={section.description}
          />

          <div className="grid gap-6 md:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="border-y border-border/70 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-8 pt-5 md:pt-6">
          <SectionHeading
            kicker={t("sections.active.kicker")}
            title={t("sections.active.title")}
            description={t("sections.active.description")}
          />
          <div className="grid gap-6">
            {activeIncidents.length > 0 ? (
              activeIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  sectionNames={[sectionsById[incident.sectionId]?.name ?? incident.sectionId]}
                  timeLabel={formatDurationMinutes(incident.window.expectedDurationMinutes, locale)}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/u/[username]/events/[eventSlug]",
                    params: {username, eventSlug: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.active")}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8 pt-5 md:pt-6">
          <SectionHeading
            kicker={t("sections.scheduled.kicker")}
            title={t("sections.scheduled.title")}
            description={t("sections.scheduled.description")}
          />
          <div className="grid gap-6">
            {scheduledIncidents.length > 0 ? (
              scheduledIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  sectionNames={[sectionsById[incident.sectionId]?.name ?? incident.sectionId]}
                  timeLabel={formatDateRange(
                    incident.window.startedAt,
                    incident.window.expectedEndAt,
                    locale,
                  )}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/u/[username]/events/[eventSlug]",
                    params: {username, eventSlug: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.scheduled")}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8 pt-5 md:pt-6">
          <SectionHeading
            kicker={t("sections.resolved.kicker")}
            title={t("sections.resolved.title")}
            description={t("sections.resolved.description")}
          />
          <div className="grid gap-6">
            {resolvedIncidents.length > 0 ? (
              resolvedIncidents.map((incident) => (
                <IncidentListItem
                  key={incident.id}
                  incident={incident}
                  sectionNames={[sectionsById[incident.sectionId]?.name ?? incident.sectionId]}
                  timeLabel={formatDateTime(incident.updatedAt, locale, {year: "numeric"})}
                  severityLabel={severityCopy[incident.severity].label}
                  severityDescription={severityCopy[incident.severity].description}
                  statusLabel={statusCopy[incident.status].label}
                  visibilityLabel={visibilityCopy[incident.visibility].label}
                  href={{
                    pathname: "/u/[username]/events/[eventSlug]",
                    params: {username, eventSlug: incident.slug},
                  }}
                  hrefLabel={tCommon("actions.viewIncident")}
                />
              ))
            ) : (
              <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">
                {t("empty.resolved")}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
