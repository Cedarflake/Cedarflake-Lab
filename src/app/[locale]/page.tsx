import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {SectionHeading} from "@/components/ui/section-heading";
import {Link} from "@/i18n/navigation";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
import {getActiveIncidents, getRecentIncidents} from "@/lib/domain/dashboard";
import {mockUserSpaceData} from "@/lib/mock";

type PageParams = Promise<{
  locale: string;
}>;

async function getLocaleFromParams(params: PageParams): Promise<AppLocale> {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return locale;
}

export default async function LocalizedHomePage({
  params,
}: {
  params: PageParams;
}) {
  const locale = await getLocaleFromParams(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "PlatformHome"});
  const discoverableSpaces = mockUserSpaceData.filter((space) => space.owner.isDiscoverable);
  const totalSections = discoverableSpaces.reduce((sum, space) => sum + space.lifeSections.length, 0);
  const totalActiveIncidents = discoverableSpaces.reduce(
    (sum, space) => sum + getActiveIncidents(space.incidents).length,
    0,
  );
  const totalRecentEvents = discoverableSpaces.reduce(
    (sum, space) => sum + getRecentIncidents(space.incidents, 10).length,
    0,
  );
  const featuredSpace = discoverableSpaces[0] ?? null;

  return (
    <div className="page-shell">
      <main className="page-container flex flex-col gap-14 py-14 md:gap-20 md:py-20">
        <section className="space-y-8 pt-8 md:pt-12">
          <SectionHeading
            kicker={t("hero.kicker")}
            title={t("hero.title")}
            description={t("hero.description")}
            className="max-w-4xl"
          />
          <div className="flex flex-wrap gap-3">
            {featuredSpace ? (
              <Link
                href={{
                  pathname: "/u/[username]",
                  params: {username: featuredSpace.owner.username},
                }}
                className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
              >
                {t("hero.primaryCta", {name: featuredSpace.owner.displayName})}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="space-y-8 pt-2 md:pt-4">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="border-y border-border/70 px-5 py-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("metrics.users")}
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {discoverableSpaces.length}
              </div>
            </div>
            <div className="border-y border-border/70 px-5 py-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("metrics.sections")}
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {totalSections}
              </div>
            </div>
            <div className="border-y border-border/70 px-5 py-5">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("metrics.events")}
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {totalRecentEvents + totalActiveIncidents}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-9 pt-8 md:pt-10">
          <SectionHeading
            kicker={t("directory.kicker")}
            title={t("directory.title")}
            description={t("directory.description")}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            {discoverableSpaces.map((space) => {
              const activeCount = getActiveIncidents(space.incidents).length;
              const recentCount = getRecentIncidents(space.incidents, 10).length;

              return (
                <article key={space.owner.id} className="surface-card px-6 py-7 md:px-7 md:py-8">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          @{space.owner.username}
                        </p>
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                          {space.owner.displayName}
                        </h2>
                      </div>
                      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                        {space.owner.avatarLabel}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-foreground/90">{space.owner.headline}</p>
                    <p className="text-sm leading-7 text-muted-foreground">{space.owner.bio}</p>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="surface-muted px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("directory.sectionCount")}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {space.lifeSections.length}
                        </div>
                      </div>
                      <div className="surface-muted px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("directory.activeCount")}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {activeCount}
                        </div>
                      </div>
                      <div className="surface-muted px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("directory.recentCount")}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {recentCount}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Link
                        href={{
                          pathname: "/u/[username]",
                          params: {username: space.owner.username},
                        }}
                        className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
                      >
                        {t("directory.viewSpace", {name: space.owner.displayName})}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
