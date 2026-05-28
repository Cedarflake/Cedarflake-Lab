import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {SectionHeading} from "@/components/ui/section-heading";
import {isValidLocale, type AppLocale} from "@/i18n/routing";
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

export default async function StudioSettingsPage({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const locale = await getValidatedLocale(params);

  setRequestLocale(locale);

  const t = await getTranslations({locale, namespace: "Studio.settings"});
  const studioSpace = getStudioUserSpaceData();

  if (!studioSpace) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        kicker={t("hero.kicker")}
        title={t("hero.title")}
        description={t("hero.description")}
      />

      <section className="grid gap-6 xl:grid-cols-3">
        <SettingsCard
          title={t("cards.profileTitle")}
          lines={[
            `${t("cards.profileName")}: ${studioSpace.owner.displayName}`,
            `${t("cards.profileUsername")}: @${studioSpace.owner.username}`,
            `${t("cards.profileHeadline")}: ${studioSpace.owner.headline}`,
          ]}
        />
        <SettingsCard
          title={t("cards.visibilityTitle")}
          lines={[
            `${t("cards.visibilityState")}: ${studioSpace.owner.isDiscoverable ? t("cards.visibilityPublic") : t("cards.visibilityPrivate")}`,
            t("cards.visibilityDescription"),
          ]}
        />
        <SettingsCard
          title={t("cards.summaryTitle")}
          lines={[
            `${t("cards.summarySections")}: ${studioSpace.lifeSections.length}`,
            `${t("cards.summaryEvents")}: ${studioSpace.incidents.length}`,
            `${t("cards.summaryRoute")}: /u/${studioSpace.owner.username}`,
          ]}
        />
      </section>
    </div>
  );
}

function SettingsCard({title, lines}: {title: string; lines: string[]}) {
  return (
    <article className="surface-card px-6 py-7 md:px-8 md:py-8">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
