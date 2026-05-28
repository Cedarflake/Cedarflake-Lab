import type {Incident, LifeSection} from "@/types";

function sortIncidentsByPublishedAtDesc(incidents: Incident[]) {
  return [...incidents].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

export function getSectionIncidentCount(
  section: LifeSection,
  incidents: Incident[],
) {
  return incidents.filter((incident) => incident.sectionId === section.id).length;
}

export function getSectionBySlug(sections: LifeSection[], slug: string) {
  return sections.find((section) => section.slug === slug) ?? null;
}

export function getIncidentsBySection(sectionId: string, incidents: Incident[]) {
  return sortIncidentsByPublishedAtDesc(
    incidents.filter((incident) => incident.sectionId === sectionId),
  );
}

export function getActiveIncidentsBySection(sectionId: string, incidents: Incident[]) {
  return getActiveIncidents(getIncidentsBySection(sectionId, incidents));
}

export function getUpcomingMaintenancesBySection(
  sectionId: string,
  incidents: Incident[],
  now = new Date(),
) {
  return getUpcomingMaintenances(getIncidentsBySection(sectionId, incidents), now);
}

export function getResolvedIncidentsBySection(sectionId: string, incidents: Incident[]) {
  return getIncidentsBySection(sectionId, incidents).filter(
    (incident) => incident.status === "resolved",
  );
}

export function getRecentIncidents(incidents: Incident[], limit = 10) {
  return sortIncidentsByPublishedAtDesc(incidents).slice(0, limit);
}

export function groupIncidentsByPublishedDate(incidents: Incident[]) {
  const groups = new Map<string, Incident[]>();

  for (const incident of sortIncidentsByPublishedAtDesc(incidents)) {
    const dateKey = incident.publishedAt.slice(0, 10);
    const current = groups.get(dateKey) ?? [];

    current.push(incident);
    groups.set(dateKey, current);
  }

  return Array.from(groups.entries()).map(([date, items]) => ({
    date,
    incidents: items,
  }));
}

export function getActiveIncidents(incidents: Incident[]) {
  return incidents
    .filter((incident) => incident.status !== "resolved" && !incident.isScheduled)
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
    );
}

export function getUpcomingMaintenances(incidents: Incident[], now = new Date()) {
  return incidents
    .filter(
      (incident) =>
        incident.isScheduled &&
        incident.status === "scheduled" &&
        new Date(incident.window.startedAt).getTime() >= now.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.window.startedAt).getTime() -
        new Date(right.window.startedAt).getTime(),
    );
}

export function getRecentResolvedIncidents(incidents: Incident[], limit = 4) {
  return incidents
    .filter((incident) => incident.status === "resolved")
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, limit);
}

export function getSectionsById(sections: LifeSection[]) {
  return Object.fromEntries(sections.map((section) => [section.id, section]));
}
