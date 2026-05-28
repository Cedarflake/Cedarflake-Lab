import type {IntlMessages} from "@/i18n/messages";
import {routing} from "@/i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: IntlMessages;
  }
}
