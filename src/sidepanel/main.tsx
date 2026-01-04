import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../globals.css";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { SidePanelApp } from "./SidePanelApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SidePanelApp />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
