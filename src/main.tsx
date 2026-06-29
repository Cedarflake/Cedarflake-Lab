import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TemplateProvider } from "./template/TemplateProvider";
import TasksWaitlistPage from "./pages/tasks-waitlist/TasksWaitlistPage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TemplateProvider>
        <TasksWaitlistPage />
      </TemplateProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
