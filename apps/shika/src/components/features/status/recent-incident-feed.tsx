import type {ComponentProps} from "react";

import {Link} from "@/i18n/navigation";
import {groupIncidentsByPublishedDate} from "@/lib/domain/dashboard";
import {sortTimelineUpdatesDesc} from "@/lib/domain/incidents-feed";
import {formatCalendarDate, formatDateTime, formatRelativeTime} from "@/lib/formatters";
import type {
  Incident,
  IncidentLifecycleStatus,
  LifeSection,
  LifeSectionId,
} from "@/types";

type IncidentLinkHref = ComponentProps<typeof Link>["href"];

export function RecentIncidentFeed({
  incidents,
  sectionsById,
  locale,
  emptyLabel,
  detailLabel,
  statusLabels,
  getIncidentHref,
}: {
  incidents: Incident[];
  sectionsById: Record<LifeSectionId, LifeSection>;
  locale: string;
  emptyLabel: string;
  detailLabel: string;
  statusLabels: Record<IncidentLifecycleStatus, string>;
  getIncidentHref: (incident: Incident) => IncidentLinkHref;
}) {
  if (incidents.length === 0) {
    return <div className="border-y border-border/70 px-6 py-8 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  const groupedIncidents = groupIncidentsByPublishedDate(incidents);

  return (
    <div className="space-y-12">
      {groupedIncidents.map((group) => (
        <section key={group.date} className="space-y-6 pt-4 first:pt-0 md:space-y-7 md:pt-5">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {formatCalendarDate(group.date, locale)}
          </h3>
          <div className="space-y-9">
            {group.incidents.map((incident) => {
              const sectionName = sectionsById[incident.sectionId]?.name ?? incident.sectionId;
              const timeline = sortTimelineUpdatesDesc(incident.timeline);
              const href: IncidentLinkHref = getIncidentHref(incident);

              return (
                <article key={incident.id} className="space-y-5 border-l border-border/70 pl-5">
                  <div className="space-y-3">
                    <Link
                      href={href}
                      className="text-lg font-semibold tracking-tight text-foreground transition hover:text-primary"
                    >
                      {incident.title}
                    </Link>
                    <p className="text-sm leading-6 text-muted-foreground">{incident.summary}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{sectionName}</span>
                    </div>
                  </div>

                  <ol className="space-y-4">
                    {timeline.map((update) => (
                      <li key={update.id} className="space-y-1.5">
                        <div className="text-sm leading-6 text-foreground">
                          <span className="font-medium">{statusLabels[update.status]}</span>
                          <span className="text-muted-foreground">{" - "}</span>
                          <span>{update.message}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(update.createdAt, locale, {
                            year: "numeric",
                            timeZone: "UTC",
                            timeZoneName: "short",
                          })}{" "}
                          ({formatRelativeTime(update.createdAt, locale)})
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div>
                    <Link
                      href={href}
                      className="text-xs font-medium text-muted-foreground transition hover:text-primary"
                    >
                      {detailLabel}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
