import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

/**
 * Application entry point.
 *
 * We wrap the app in three providers:
 *   BrowserRouter       — enables React Router navigation
 *   QueryClientProvider — provides React Query cache to all components
 *
 * QueryClient configuration:
 *   staleTime: 30s — data stays "fresh" for 30s, no background refetch during that window
 *   retry: 1       — retry failed queries once before showing error UI
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,   // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false, // Don't refetch just because user switched tabs
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found in index.html");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
