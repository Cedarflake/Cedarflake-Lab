import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {
  getActiveIncidents,
  getRecentIncidents,
  getUpcomingMaintenances,
} from "@/lib/domain/dashboard";
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

export default async function StudioOverviewPage({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const locale = await getValidatedLocale(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Studio.overview"});
  const tStudio = await getTranslations({locale, namespace: "Studio"});
  const studioSpace = getStudioUserSpaceData();

  if (!studioSpace) {
    notFound();
  }

  const activeEvents = getActiveIncidents(studioSpace.incidents);
  const plannedMaintenances = getUpcomingMaintenances(studioSpace.incidents);
  const recentEvents = getRecentIncidents(studioSpace.incidents, 4);

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        kicker={t("hero.kicker")}
        title={t("hero.title")}
        description={t("hero.description")}
      />

      <section className="space-y-4">
        <MetricCard label={t("metrics.sections")} value={String(studioSpace.lifeSections.length)} />
        <MetricCard label={t("metrics.events")} value={String(studioSpace.incidents.length)} />
        <MetricCard label={t("metrics.active")} value={String(activeEvents.length)} />
        <MetricCard label={t("metrics.planned")} value={String(plannedMaintenances.length)} />
      </section>

      <section className="surface-card px-6 py-7 md:px-8 md:py-8">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t("panels.spaceTitle")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("panels.spaceDescription")}
          </p>
        </div>

        <article className="surface-muted mt-8 px-5 py-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                @{studioSpace.owner.username}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">
                {studioSpace.owner.displayName}
              </h3>
            </div>
            <p className="text-sm font-medium text-foreground/90">{studioSpace.owner.headline}</p>
            <p className="text-sm leading-6 text-muted-foreground">{studioSpace.owner.bio}</p>
            <div className="space-y-3">
              <MetaStat
                label={t("spaceCard.visibility")}
                value={studioSpace.owner.isDiscoverable ? tStudio("visibility.public") : tStudio("visibility.private")}
              />
              <MetaStat label={t("spaceCard.sections")} value={String(studioSpace.lifeSections.length)} />
              <MetaStat label={t("spaceCard.events")} value={String(studioSpace.incidents.length)} />
            </div>
            <div className="pt-2">
              <StudioLink
                href={{pathname: "/u/[username]", params: {username: studioSpace.owner.username}}}
                label={t("actions.viewPublicSpace")}
              />
            </div>
          </div>
        </article>
      </section>

      <section className="surface-card px-6 py-7 md:px-8 md:py-8">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t("panels.recentTitle")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("panels.recentDescription")}
          </p>
        </div>
        <ul className="space-y-4 pt-8 text-sm leading-6 text-muted-foreground">
          {recentEvents.map((incident) => (
            <li key={incident.id} className="surface-muted px-4 py-4">
              <div className="font-medium text-foreground">{incident.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{incident.summary}</div>
            </li>
          ))}
        </ul>
        <div className="space-y-3 pt-8">
          <div>
            <StudioLink href="/studio/sections" label={t("actions.openSections")} />
          </div>
          <div>
            <StudioLink href="/studio/events" label={t("actions.openEvents")} />
          </div>
          <div>
            <StudioLink href="/studio/settings" label={t("actions.openSettings")} />
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({label, value}: {label: string; value: string}) {
  return (
    <div className="border-y border-border/70 px-5 py-5">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function MetaStat({label, value}: {label: string; value: string}) {
  return (
    <div className="border-y border-border/70 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StudioLink({
  href,
  label,
}: {
  href:
    | "/studio/sections"
    | "/studio/events"
    | "/studio/settings"
    | {pathname: "/u/[username]"; params: {username: string}};
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
    >
      {label}
    </Link>
  );
}
