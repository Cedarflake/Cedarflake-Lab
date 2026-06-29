/**
 * ActionBadge - A small badge showing an icon + label for feature actions.
 *
 * Used in Section 3 (Features) to display the related tools/services
 * for each feature (e.g., "Schedule with Calendar", "Save to OneDrive").
 */

import React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  ArrowRefreshIcon,
  EdgeIcon,
  CursorClickIcon,
  OnedriveIcon,
  OutlookIcon,
  GoogleCalendarIcon,
  GoogleGmailIcon,
  EmailIcon,
  SearchIcon,
  CalendarIcon,
  SendEmailIcon,
} from "@/lib/icons";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  arrowRefresh: ArrowRefreshIcon,
  edge: EdgeIcon,
  cursorClick: CursorClickIcon,
  onedrive: OnedriveIcon,
  outlook: OutlookIcon,
  googleCalendar: GoogleCalendarIcon,
  googleGmail: GoogleGmailIcon,
  email: EmailIcon,
  search: SearchIcon,
  schedule: CalendarIcon,
  sendEmail: SendEmailIcon,

  artifactSlides: GoogleCalendarIcon,
  artifactDocuments: EmailIcon,
  artifactSheets: SearchIcon,
};

interface ActionBadgeProps {
  label?: string;
  labelKey?: string;
  icon?: string;
  className?: string;
}

export function ActionBadge({ label, labelKey, icon, className }: ActionBadgeProps) {
  const { t } = useTranslation();
  const IconComponent = icon ? ICON_MAP[icon] : undefined;
  const text = label ?? (labelKey ? t(labelKey) : "");

  return (
    <span
      className={cn(
        "relative flex items-center gap-1.5 rounded-full",
        "border border-black/[.12] bg-white/[.15] px-3 py-1.5 text-sm",
        "text-foreground-600 dark:bg-white/5",
        "md:gap-2 md:px-3.5 md:text-base",
        className,
      )}
    >
      {IconComponent && <IconComponent className="size-4 shrink-0 md:size-5" />}
      <span className="px-0.5">{text}</span>
    </span>
  );
}
