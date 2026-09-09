import { registerPwa } from "./offline/pwa";
import React from "react";
import ReactDOM from "react-dom/client";
import "@dryadsoft/react-ink-canvas/styles.css";
import "./index.css";
import App from "./App";
import { QueryClient, QueryClientProvider } from "react-query";

// Create a client
const queryClient = new QueryClient();
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

void registerPwa();
