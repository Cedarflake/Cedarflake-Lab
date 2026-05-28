import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {StudioNav} from "@/components/navigation/studio-nav";
import {isValidLocale} from "@/i18n/routing";
import {getStudioUserSpaceData} from "@/lib/mock";

export default async function StudioLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const {locale} = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const studioSpace = getStudioUserSpaceData();

  if (!studioSpace) {
    notFound();
  }

  return (
    <div className="page-shell">
      <main className="page-container py-10 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
            <div className="mb-5 border-y border-border/70 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                @{studioSpace.owner.username}
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                {studioSpace.owner.displayName}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {studioSpace.owner.headline}
              </p>
            </div>
            <StudioNav />
          </aside>
          <div>{children}</div>
        </div>
      </main>
    </div>
  );
}
