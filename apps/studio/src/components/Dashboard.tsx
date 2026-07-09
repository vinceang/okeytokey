import { useState } from "react";

import { Button, TextInput } from "@okeytokey/ui";

import {
  createProject,
  deleteProject,
  initProjects,
  renameProject,
  type Project,
} from "../state/projects.js";

function navigate(id: string) {
  window.location.hash = `/project/${id}`;
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(() => initProjects());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");

  const refresh = () => setProjects(initProjects());

  const handleCreate = () => {
    if (!newName.trim()) return;
    const project = createProject(newName);
    setCreating(false);
    setNewName("");
    navigate(project.id);
  };

  const handleRename = (id: string) => {
    if (!renameValue.trim()) return;
    renameProject(id, renameValue);
    setRenamingId(undefined);
    refresh();
  };

  const handleDelete = (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete "${name}"? The token data will remain in your browser but will not be accessible from the dashboard.`,
      )
    )
      return;
    deleteProject(id);
    refresh();
  };

  return (
    <div className="okey-app dashboard">
      <header className="dashboard-header">
        <span className="dashboard-wordmark">okeytokey</span>
        <Button
          variant="primary"
          onClick={() => {
            setCreating(true);
            setNewName("");
          }}
        >
          New project
        </Button>
      </header>

      <main className="dashboard-main">
        <h1 className="dashboard-title">Your design systems</h1>

        {creating && (
          <div className="dashboard-create">
            <TextInput
              autoFocus
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        )}

        {projects.length === 0 && !creating && (
          <p className="dashboard-empty">No projects yet. Create one to get started.</p>
        )}

        <ul className="dashboard-list">
          {projects.map((project) => (
            <li key={project.id} className="dashboard-project">
              {renamingId === project.id ? (
                <div className="dashboard-rename">
                  <TextInput
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(project.id);
                      if (e.key === "Escape") setRenamingId(undefined);
                    }}
                  />
                  <Button variant="primary" onClick={() => handleRename(project.id)}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setRenamingId(undefined)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="dashboard-project-name"
                    onClick={() => navigate(project.id)}
                  >
                    <span className="dashboard-project-title">{project.name}</span>
                    <span className="dashboard-project-meta">
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  <div className="dashboard-project-actions">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRenamingId(project.id);
                        setRenameValue(project.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(project.id, project.name)}>
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
