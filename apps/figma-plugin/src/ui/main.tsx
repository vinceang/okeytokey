import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BRIDGE_PROTOCOL_VERSION } from "@okeytokey/figma-bridge";

function App() {
  return (
    <main style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "1rem" }}>
      <h1 style={{ fontSize: "1rem", margin: 0 }}>okeytokey</h1>
      <p style={{ opacity: 0.65 }}>
        Plugin scaffold — bridge protocol v{BRIDGE_PROTOCOL_VERSION}. Token application and variable
        sync arrive in Phase 5.
      </p>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root is missing from ui.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
