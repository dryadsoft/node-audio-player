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
  <div role="status" style={{ padding: 24 }}>
    새 버전을 확인하고 있습니다…
  </div>
);
void registerPwa().then((reloading) => {
  if (reloading) return;
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
});
