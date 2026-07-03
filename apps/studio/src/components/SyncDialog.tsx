import { useState } from "react";

import {
  createTokenDocument,
  diffDocuments,
  parseTokenSet,
  serializeTokenSet,
  type DocumentDiff,
  type TokenDocument,
} from "@okeytokey/core";
import {
  GitHubProvider,
  documentToFiles,
  mergeDocuments,
  resolveConflict,
  type DoctorReport,
  type MergeConflict,
} from "@okeytokey/sync";
import { Button, Field, TextInput } from "@okeytokey/ui";

import { useDocumentStore } from "../state/document-store.js";
import { Dialog } from "./dialogs.js";

/**
 * GitHub sync: settings, connection doctor, dry-run push (semantic diff
 * before anything is written), push, and pull with token-level three-way
 * merge when both sides changed.
 */

interface SyncSettings {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

const SETTINGS_KEY = "okeytokey.sync.github";
const BASE_KEY = "okeytokey.sync.base";

function loadSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw !== null) return JSON.parse(raw) as SyncSettings;
  } catch {
    /* fall through */
  }
  return { owner: "", repo: "", branch: "main", path: "tokens", token: "" };
}

/** Last-synced snapshot: the base side of the three-way merge. */
function loadBase(): TokenDocument | undefined {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    if (raw === null) return undefined;
    const files = JSON.parse(raw) as { name: string; json: string }[];
    return createTokenDocument(files.map((file) => parseTokenSet(file.name, file.json)));
  } catch {
    return undefined;
  }
}

function saveBase(document: TokenDocument): void {
  const files = [...document.sets.values()].map((set) => ({
    name: set.name,
    json: serializeTokenSet(set),
  }));
  localStorage.setItem(BASE_KEY, JSON.stringify(files));
}

function documentFromFiles(files: readonly { path: string; content: string }[]): TokenDocument {
  return createTokenDocument(
    files.map((file) => {
      const name = (file.path.split("/").pop() ?? file.path).replace(/\.json$/i, "");
      return parseTokenSet(name, file.content);
    }),
  );
}

const FIELDS: { key: keyof SyncSettings; label: string; secret?: boolean }[] = [
  { key: "owner", label: "Owner" },
  { key: "repo", label: "Repository" },
  { key: "branch", label: "Branch" },
  { key: "path", label: "Path" },
  { key: "token", label: "Access token", secret: true },
];

export function SyncDialog({ onClose }: { onClose: () => void }) {
  const tokenDocument = useDocumentStore((state) => state.document);
  const hydrate = useDocumentStore((state) => state.hydrate);
  const themes = useDocumentStore((state) => state.themes);

  const [settings, setSettings] = useState(loadSettings);
  const [report, setReport] = useState<DoctorReport>();
  const [dryRun, setDryRun] = useState<DocumentDiff>();
  const [conflicts, setConflicts] = useState<MergeConflict[]>();
  const [merged, setMerged] = useState<TokenDocument>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  const provider = () => new GitHubProvider(settings);

  const persistSettings = (next: SyncSettings) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  const guard = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setStatus(undefined);
    try {
      await action();
    } catch (error) {
      setStatus(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const runDoctor = () =>
    guard("Doctor", async () => {
      setReport(await provider().healthCheck());
    });

  const runDryRun = () =>
    guard("Dry-run", async () => {
      const remote = await provider().readTokens();
      const remoteDocument = documentFromFiles(remote.files);
      setDryRun(diffDocuments(remoteDocument, tokenDocument));
    });

  const runPush = () =>
    guard("Push", async () => {
      const files = documentToFiles(tokenDocument, settings.path, (name) => {
        const set = tokenDocument.sets.get(name);
        return set ? serializeTokenSet(set) : "{}";
      });
      const result = await provider().writeTokens(
        files,
        "chore(tokens): sync from okeytokey studio",
      );
      saveBase(tokenDocument);
      setDryRun(undefined);
      setStatus(
        `Pushed ${String(files.length)} file(s) as ${result.commitSha.slice(0, 7)} on ${result.branch}`,
      );
    });

  const runPull = () =>
    guard("Pull", async () => {
      const remote = await provider().readTokens();
      const remoteDocument = documentFromFiles(remote.files);
      const base = loadBase();
      if (!base) {
        // No base: remote replaces local (first sync).
        hydrate(remoteDocument, themes);
        saveBase(remoteDocument);
        setStatus("Pulled remote tokens (no local base — remote adopted).");
        return;
      }
      const result = mergeDocuments(base, tokenDocument, remoteDocument);
      if (result.conflicts.length === 0) {
        hydrate(result.document, themes);
        saveBase(remoteDocument);
        setStatus("Pulled and merged cleanly.");
      } else {
        setMerged(result.document);
        setConflicts([...result.conflicts]);
        setStatus(`${String(result.conflicts.length)} conflict(s) — pick a side per token.`);
      }
    });

  const pickConflict = (conflict: MergeConflict, side: "ours" | "theirs") => {
    if (!merged || !conflicts) return;
    const nextDocument = resolveConflict(merged, conflict, side);
    const remaining = conflicts.filter((candidate) => candidate !== conflict);
    setMerged(nextDocument);
    setConflicts(remaining);
    if (remaining.length === 0) {
      hydrate(nextDocument, themes);
      saveBase(nextDocument);
      setConflicts(undefined);
      setMerged(undefined);
      setStatus("Merge complete.");
    }
  };

  const totalChanges = dryRun?.sets.reduce((sum, set) => sum + set.changes.length, 0) ?? 0;

  return (
    <Dialog title="Sync with GitHub" onClose={onClose}>
      <div className="editor-grid-2">
        {FIELDS.map(({ key, label, secret }) => (
          <Field key={key} label={label}>
            {(id) => (
              <TextInput
                id={id}
                mono
                type={secret ? "password" : "text"}
                value={settings[key]}
                data-testid={`sync-${key}`}
                onChange={(event) => {
                  persistSettings({ ...settings, [key]: event.target.value });
                }}
              />
            )}
          </Field>
        ))}
      </div>

      <div className="editor-row">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void runDoctor()}
          data-testid="sync-doctor"
        >
          Run connection doctor
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void runDryRun()}
          data-testid="sync-dry-run"
        >
          Dry-run push
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void runPull()}
          data-testid="sync-pull"
        >
          Pull
        </Button>
      </div>

      {report && (
        <div className="doctor-report" data-testid="doctor-report">
          {report.steps.map((step) => (
            <p
              key={step.step}
              className={step.ok ? "doctor-step" : "doctor-step doctor-step--failed"}
            >
              {step.ok ? "✓" : "✗"} <strong>{step.step}</strong> — {step.detail}
              {step.hint !== undefined && <span className="doctor-hint"> {step.hint}</span>}
            </p>
          ))}
        </div>
      )}

      {dryRun && (
        <div className="dry-run" data-testid="dry-run-result">
          <p className="section-label">
            {totalChanges === 0
              ? "Remote is identical — nothing to push."
              : `${String(totalChanges)} change(s); ${String(dryRun.impactedPaths.length)} token(s) affected after resolution`}
          </p>
          {dryRun.sets.map((set) =>
            set.changes.map((change) => (
              <p key={`${set.setName}:${change.path}`} className="dry-run-change">
                <code>
                  [{change.kind}] {set.setName} · {change.path}
                  {change.kind === "renamed" ? ` → ${change.toPath}` : ""}
                </code>
              </p>
            )),
          )}
          {totalChanges > 0 && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void runPush()}
              data-testid="sync-push"
            >
              Push {String(totalChanges)} change(s)
            </Button>
          )}
        </div>
      )}

      {conflicts && merged && (
        <div className="merge-conflicts" data-testid="merge-conflicts">
          {conflicts.map((conflict) => (
            <div key={`${conflict.setName}:${conflict.path}`} className="merge-conflict">
              <code>
                {conflict.setName} · {conflict.path}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
                  pickConflict(conflict, "ours");
                }}
              >
                Keep mine ({JSON.stringify(conflict.ours)})
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  pickConflict(conflict, "theirs");
                }}
              >
                Take remote ({JSON.stringify(conflict.theirs)})
              </Button>
            </div>
          ))}
        </div>
      )}

      {status !== undefined && (
        <p className="sync-status" data-testid="sync-status">
          {status}
        </p>
      )}

      <footer>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </footer>
    </Dialog>
  );
}
