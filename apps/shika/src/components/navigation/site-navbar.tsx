"use client";

import {LocaleSwitcher} from "@/components/i18n/locale-switcher";
import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";

export function SiteNavbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="page-container flex min-h-[var(--header-height)] items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-3 md:gap-6">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold uppercase tracking-[0.24em] text-foreground transition hover:text-primary"
          >
            {siteConfig.name}
          </Link>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/studio"
            className="inline-flex items-center rounded-full border border-border px-3.5 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            Studio
          </Link>
          <LocaleSwitcher className="shrink-0" />
        </div>
      </div>
    </header>
  );
}
