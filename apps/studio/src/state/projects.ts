/**
 * Project registry — each project is a named design system with its own
 * IndexedDB database and per-project localStorage keys. Stored as a JSON
 * array under okeytokey.projects.
 *
 * Migration: on first load the legacy single-project database
 * ("okeytokey-studio") and its global sync keys are automatically adopted
 * as the "default" project so existing users don't lose data.
 */

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

const REGISTRY_KEY = "okeytokey.projects";

/** IndexedDB database name for a project. */
export function projectDbName(id: string): string {
  return id === "default" ? "okeytokey-studio" : `okeytokey-project-${id}`;
}

/** localStorage key for the "has been onboarded" flag. */
export function projectOnboardedKey(id: string): string {
  return `okeytokey.onboarded.${id}`;
}

/** localStorage key for GitHub sync settings. */
export function projectSyncSettingsKey(id: string): string {
  return `okeytokey.sync.github.${id}`;
}

/** localStorage key for the last-synced base snapshot. */
export function projectSyncBaseKey(id: string): string {
  return `okeytokey.sync.base.${id}`;
}

function loadRegistry(): Project[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) return JSON.parse(raw) as Project[];
  } catch {
    /* corrupt entry — treat as empty */
  }
  return [];
}

function saveRegistry(projects: Project[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(projects));
}

/**
 * Load the project list, creating a "default" project from the legacy
 * single-project database if this is the first time multi-project runs.
 */
export function initProjects(): Project[] {
  const existing = loadRegistry();
  if (existing.length > 0) return existing;

  // First run under multi-project: adopt the legacy DB as the default project
  // and migrate its global sync + onboarded keys to the project-scoped form.
  const defaultProject: Project = {
    id: "default",
    name: "My Design System",
    createdAt: new Date().toISOString(),
  };

  const migrations: Array<[string, string]> = [
    ["okeytokey.sync.github", projectSyncSettingsKey("default")],
    ["okeytokey.sync.base", projectSyncBaseKey("default")],
    ["okeytokey.onboarded", projectOnboardedKey("default")],
  ];
  for (const [from, to] of migrations) {
    const value = localStorage.getItem(from);
    if (value !== null) localStorage.setItem(to, value);
  }

  const projects = [defaultProject];
  saveRegistry(projects);
  return projects;
}

export function listProjects(): Project[] {
  return loadRegistry();
}

export function createProject(name: string): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled",
    createdAt: new Date().toISOString(),
  };
  saveRegistry([...loadRegistry(), project]);
  return project;
}

export function renameProject(id: string, name: string): void {
  saveRegistry(
    loadRegistry().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
  );
}

export function deleteProject(id: string): void {
  saveRegistry(loadRegistry().filter((p) => p.id !== id));
  // IndexedDB is left intact for data recovery; it becomes orphaned.
}
