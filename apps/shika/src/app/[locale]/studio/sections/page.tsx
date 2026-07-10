import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {StudioSectionsWorkbench} from "@/components/features/studio/studio-sections-workbench";
import {SectionHeading} from "@/components/ui/section-heading";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {SEVERITY_META} from "@/lib/constants/severity";
import {getActiveIncidentsBySection} from "@/lib/domain/dashboard";
import {getStudioUserSpaceData} from "@/lib/mock";
import type {IncidentSeverity} from "@/types";

async function getValidatedLocale(
  params: Promise<{locale: string}>,
): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export default async function StudioSectionsPage({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const locale = await getValidatedLocale(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Studio.sections"});
  const tCommon = await getTranslations({locale, namespace: "IncidentCommon"});
  const studioSpace = getStudioUserSpaceData();

  if (!studioSpace) {
    notFound();
  }

  const currentSeverityBySectionId = Object.fromEntries(
    studioSpace.lifeSections.map((section) => {
      const activeIncidents = getActiveIncidentsBySection(section.id, studioSpace.incidents);
      const severity = activeIncidents.reduce<IncidentSeverity>((highest, incident) => {
        return SEVERITY_META[incident.severity].level > SEVERITY_META[highest].level
          ? incident.severity
          : highest;
      }, "normal");

      return [section.id, severity];
    }),
  ) as Record<string, IncidentSeverity>;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        kicker={t("hero.kicker")}
        title={t("hero.title")}
        description={t("hero.description")}
      />

      <StudioSectionsWorkbench
        records={studioSpace.lifeSections}
        locale={locale}
        currentSeverityBySectionId={currentSeverityBySectionId}
        labels={{
          visibility: t("labels.visibility"),
          severity: t("labels.severity"),
          editorTitle: t("editor.title"),
          editorDescription: t("editor.description"),
          draftHint: t("editor.draftHint"),
          reorderHint: t("reorder.hint"),
          dragHandleLabel: t("reorder.handleLabel"),
          duplicateSuffix: t("actions.duplicateSuffix"),
          fields: {
            name: t("fields.name"),
            description: t("fields.description"),
            category: t("fields.category"),
            defaultVisibility: t("fields.defaultVisibility"),
          },
          actions: {
            createDraft: t("actions.createDraft"),
            reorderOn: t("actions.reorderOn"),
            reorderOff: t("actions.reorderOff"),
            duplicateCurrent: t("actions.duplicateCurrent"),
            reset: t("actions.reset"),
            markSaved: t("actions.markSaved"),
            close: t("actions.close"),
          },
          status: {
            localDraft: t("status.localDraft"),
            sourceSection: t("status.sourceSection"),
            lastSaved: t("status.lastSaved"),
            neverSaved: t("status.neverSaved"),
          },
          categories: {
            health: t("categories.health"),
            mind: t("categories.mind"),
            study: t("categories.study"),
            art: t("categories.art"),
          },
          visibilityOptions: {
            public: tCommon("visibility.public.label"),
            authenticated: tCommon("visibility.authenticated.label"),
            private: tCommon("visibility.private.label"),
          },
          severityOptions: {
            normal: tCommon("severity.normal.label"),
            maintenance: tCommon("severity.maintenance.label"),
            notice: tCommon("severity.notice.label"),
            warning: tCommon("severity.warning.label"),
            critical: tCommon("severity.critical.label"),
          },
        }}
      />
    </div>
  );
}
