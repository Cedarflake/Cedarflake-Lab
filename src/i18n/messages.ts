import type {AppLocale} from "@/i18n/routing";

import enMetadata from "@/messages/en/metadata.json";
import enLocaleSwitcher from "@/messages/en/locale-switcher.json";
import enPlatformHome from "@/messages/en/platform-home.json";
import enStudio from "@/messages/en/studio.json";
import enHome from "@/messages/en/home.json";
import enIncidentCommon from "@/messages/en/incident-common.json";
import enIncidentDetail from "@/messages/en/incident-detail.json";
import enSectionPage from "@/messages/en/section-page.json";

type MessageLoader = () => Promise<{default: unknown}>;

export type IntlMessages = {
  Metadata: typeof enMetadata;
  LocaleSwitcher: typeof enLocaleSwitcher;
  PlatformHome: typeof enPlatformHome;
  Studio: typeof enStudio;
  Home: typeof enHome;
  IncidentCommon: typeof enIncidentCommon;
  IncidentDetail: typeof enIncidentDetail;
  SectionPage: typeof enSectionPage;
};

const localeMessageLoaders: Record<AppLocale, Record<keyof IntlMessages, MessageLoader>> = {
  "zh-CN": {
    Metadata: () => import("@/messages/zh-CN/metadata.json"),
    LocaleSwitcher: () => import("@/messages/zh-CN/locale-switcher.json"),
    PlatformHome: () => import("@/messages/zh-CN/platform-home.json"),
    Studio: () => import("@/messages/zh-CN/studio.json"),
    Home: () => import("@/messages/zh-CN/home.json"),
    IncidentCommon: () => import("@/messages/zh-CN/incident-common.json"),
    IncidentDetail: () => import("@/messages/zh-CN/incident-detail.json"),
    SectionPage: () => import("@/messages/zh-CN/section-page.json"),
  },
  en: {
    Metadata: () => import("@/messages/en/metadata.json"),
    LocaleSwitcher: () => import("@/messages/en/locale-switcher.json"),
    PlatformHome: () => import("@/messages/en/platform-home.json"),
    Studio: () => import("@/messages/en/studio.json"),
    Home: () => import("@/messages/en/home.json"),
    IncidentCommon: () => import("@/messages/en/incident-common.json"),
    IncidentDetail: () => import("@/messages/en/incident-detail.json"),
    SectionPage: () => import("@/messages/en/section-page.json"),
  },
};

export async function loadLocaleMessages(locale: AppLocale): Promise<IntlMessages> {
  const entries = await Promise.all(
    Object.entries(localeMessageLoaders[locale]).map(async ([namespace, load]) => {
      const loadedMessages = (await load()).default;

      return [namespace, loadedMessages] as const;
    }),
  );

  return Object.fromEntries(entries) as IntlMessages;
}