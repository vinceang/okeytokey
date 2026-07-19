import { useEffect, useState } from "react";

import { App } from "./App.js";
import { Dashboard } from "./components/Dashboard.js";

interface Location {
  view: "dashboard" | "project";
  projectId?: string;
  demo?: boolean;
}

function parseHash(hash: string): Location {
  if (hash === "#/demo") return { view: "project", projectId: "default", demo: true };
  const match = /^#\/project\/(.+)$/.exec(hash);
  if (match?.[1]) return { view: "project", projectId: match[1] };
  return { view: "dashboard" };
}

export function Router() {
  const [location, setLocation] = useState<Location>(() => {
    // Allow sharing the demo as a plain path; hand off to hash routing after load.
    if (window.location.pathname === "/demo") {
      window.history.replaceState(null, "", "/#/demo");
    }
    return parseHash(window.location.hash);
  });

  useEffect(() => {
    const onHashChange = () => setLocation(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (location.view === "project" && location.projectId) {
    return <App projectId={location.projectId} seedStarter={location.demo} />;
  }
  return <Dashboard />;
}
