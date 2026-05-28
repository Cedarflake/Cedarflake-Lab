"use client";

import {FolderKanban, Home, Settings2, Sparkles} from "lucide-react";
import {useTranslations} from "next-intl";

import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

const navItems = [
  {
    href: "/studio",
    labelKey: "overview",
    icon: Home,
  },
  {
    href: "/studio/sections",
    labelKey: "sections",
    icon: FolderKanban,
  },
  {
    href: "/studio/events",
    labelKey: "events",
    icon: Sparkles,
  },
  {
    href: "/studio/settings",
    labelKey: "settings",
    icon: Settings2,
  },
] as const;

export function StudioNav() {
  const pathname = usePathname();
  const t = useTranslations("Studio.nav");

  return (
    <nav className="space-y-2">
      <div className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {t("label")}
      </div>
      <div className="grid gap-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-background text-foreground hover:border-primary hover:text-primary",
              )}
            >
              <Icon className="size-4" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
