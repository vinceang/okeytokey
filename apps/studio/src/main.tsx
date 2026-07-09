import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Router } from "./Router.js";
import "@okeytokey/ui/tokens.css";
import "@okeytokey/ui/components.css";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
