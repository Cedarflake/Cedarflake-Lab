"use client";

import {ArrowLeft} from "lucide-react";
import {useTranslations} from "next-intl";

import {useRouter} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type HistoryBackFallbackHref =
  | "/"
  | {
      pathname: "/u/[username]";
      params: {username: string};
    }
  | {
      pathname: "/u/[username]/sections";
      params: {username: string};
    }
  | {
      pathname: "/u/[username]/sections/[sectionSlug]";
      params: {username: string; sectionSlug: string};
    };

type HistoryBackButtonProps = {
  fallbackHref: HistoryBackFallbackHref;
  className?: string;
};

export function HistoryBackButton({fallbackHref, className}: HistoryBackButtonProps) {
  const router = useRouter();
  const t = useTranslations("IncidentCommon");

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    router.push(fallbackHref, {scroll: false});
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary",
        className,
      )}
    >
      <ArrowLeft className="size-4" />
      {t("actions.back")}
    </button>
  );
}
