import {getRequestConfig} from "next-intl/server";

import {loadLocaleMessages} from "@/i18n/messages";
import {isValidLocale, routing, type AppLocale} from "@/i18n/routing";

const timeZones: Record<AppLocale, string> = {
  "zh-CN": "Asia/Shanghai",
  en: "UTC",
};

export default getRequestConfig(async ({requestLocale}) => {
  const requestedLocale = await requestLocale;
  const locale =
    requestedLocale && isValidLocale(requestedLocale)
      ? requestedLocale
      : routing.defaultLocale;

  return {
    locale,
    messages: await loadLocaleMessages(locale),
    timeZone: timeZones[locale],
    now: new Date(),
  };
});
