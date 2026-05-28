"use client";

import {ChevronDown} from "lucide-react";
import {useParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import {useEffect, useId, useRef, useState, useTransition} from "react";

import {usePathname, useRouter} from "@/i18n/navigation";
import {localeLabels, routing, type AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

export function LocaleSwitcher({className}: {className?: string}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const params = useParams<{
    username?: string;
    eventSlug?: string;
    sectionSlug?: string;
  }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function switchLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;

    setIsOpen(false);

    startTransition(() => {
      if (pathname === "/studio") {
        router.replace("/studio", {locale: nextLocale, scroll: false});

        return;
      }

      if (pathname === "/studio/sections") {
        router.replace("/studio/sections", {locale: nextLocale, scroll: false});

        return;
      }

      if (pathname === "/studio/events") {
        router.replace("/studio/events", {locale: nextLocale, scroll: false});

        return;
      }

      if (pathname === "/studio/settings") {
        router.replace("/studio/settings", {locale: nextLocale, scroll: false});

        return;
      }

      if (pathname === "/u/[username]/sections/[sectionSlug]" && params.username && params.sectionSlug) {
        router.replace(
          {
            pathname,
            params: {username: params.username, sectionSlug: params.sectionSlug},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      if (pathname === "/u/[username]/sections" && params.username) {
        router.replace(
          {
            pathname,
            params: {username: params.username},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      if (pathname === "/u/[username]/events/[eventSlug]" && params.username && params.eventSlug) {
        router.replace(
          {
            pathname,
            params: {username: params.username, eventSlug: params.eventSlug},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      if (pathname === "/u/[username]" && params.username) {
        router.replace(
          {
            pathname,
            params: {username: params.username},
          },
          {locale: nextLocale, scroll: false},
        );

        return;
      }

      router.replace("/", {locale: nextLocale, scroll: false});
    });
  }

  return (
    <div className={cn("flex items-center", className)} ref={containerRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          disabled={isPending}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={menuId}
          className={cn(
            "inline-flex min-w-28 items-center justify-between gap-2 rounded-full border border-border/70 bg-transparent px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-background",
            isOpen && "bg-background",
            isPending && "opacity-80",
          )}
        >
          <span>{localeLabels[locale]}</span>
          <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} />
        </button>

        <div
          id={menuId}
          role="listbox"
          aria-label={t("label")}
          className={cn(
            "absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-40 rounded-2xl border border-border/70 bg-background p-1.5 shadow-lg shadow-black/5 transition",
            isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
          )}
        >
          {routing.locales.map((option) => {
            const active = option === locale;

            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => switchLocale(option)}
                disabled={active || isPending}
                aria-label={`${t("switchTo")} ${localeLabels[option]}`}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                  isPending && !active && "opacity-80",
                )}
              >
                <span>{localeLabels[option]}</span>
                <span className="text-xs uppercase tracking-[0.14em] opacity-70">{option}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
