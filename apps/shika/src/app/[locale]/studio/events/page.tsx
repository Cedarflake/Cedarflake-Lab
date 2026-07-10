import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {SectionHeading} from "@/components/ui/section-heading";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {formatDateTime} from "@/lib/formatters";
import {getStudioUserSpaceData} from "@/lib/mock";

async function getValidatedLocale(
  params: Promise<{locale: string}>,
): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export default async function StudioEventsPage({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const locale = await getValidatedLocale(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Studio.events"});
  const tCommon = await getTranslations({locale, namespace: "IncidentCommon"});
  const studioSpace = getStudioUserSpaceData();

  if (!studioSpace) {
    notFound();
  }

  const events = studioSpace.incidents
    .map((incident) => ({
      sectionName:
        studioSpace.lifeSections.find((section) => section.id === incident.sectionId)?.name ?? incident.sectionId,
      incident,
    }))
    .sort((left, right) => Date.parse(right.incident.updatedAt) - Date.parse(left.incident.updatedAt));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        kicker={t("hero.kicker")}
        title={t("hero.title")}
        description={t("hero.description")}
      />

      <section className="grid gap-5">
        {events.map(({sectionName, incident}) => (
          <article key={incident.id} className="surface-card px-6 py-7 md:px-8 md:py-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {incident.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">{incident.summary}</p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {tCommon(`status.${incident.status}.label`)}
                </span>
              </div>
              <dl className="grid gap-4 md:grid-cols-3">
                <MetaItem label={t("labels.section")} value={sectionName} />
                <MetaItem label={t("labels.updated")} value={formatDateTime(incident.updatedAt, locale)} />
                <MetaItem
                  label={t("labels.visibility")}
                  value={tCommon(`visibility.${incident.visibility}.label`)}
                />
              </dl>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function MetaItem({label, value}: {label: string; value: string}) {
  return (
    <div className="surface-muted px-4 py-4">
      <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
