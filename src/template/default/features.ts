import type { TemplateFeaturesConfig } from "../types";

export const featuresConfig: TemplateFeaturesConfig = {
  headline: "What can Copilot Tasks do?",
  subtitle:
    "Copilot Tasks can handle complex, multi-step work -- so you can focus on what matters most.",
  items: [
    {
      title: "Stays on top of your tasks",
      description:
        "Copilot monitors your tasks and proactively keeps things moving -- refreshing research, checking for updates, and nudging you when something needs attention.",
      actionItems: [{ label: "Auto-refresh", icon: "arrowRefresh" }],
    },
    {
      title: "Works across the web",
      description:
        "Copilot uses Microsoft Edge to browse, click, and interact with websites on your behalf.",
      actionItems: [
        { label: "Edge", icon: "edge" },
        { label: "Click & interact", icon: "cursorClick" },
      ],
    },
    {
      title: "Connects your services",
      description:
        "Copilot integrates with OneDrive, Outlook, Google Calendar, and more to complete tasks that span multiple services.",
      actionItems: [
        { label: "OneDrive", icon: "onedrive" },
        { label: "Outlook", icon: "outlook" },
        { label: "Google Calendar", icon: "googleCalendar" },
      ],
    },
    {
      title: "Creates polished artifacts",
      description:
        "Copilot produces professional documents, slide decks, and spreadsheets ready to share.",
      actionItems: [
        { label: "Slides", icon: "artifactSlides" },
        { label: "Documents", icon: "artifactDocuments" },
        { label: "Sheets", icon: "artifactSheets" },
      ],
    },
    {
      title: "Schedules and sends for you",
      description: "Copilot can schedule meetings, send emails, and manage your calendar.",
      actionItems: [{ label: "Schedule", icon: "schedule" }],
    },
  ],
};
