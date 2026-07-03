import { useRef } from "react";

import { parseTokenSet } from "@okeytokey/core";

import { cmdImportSet } from "../state/commands.js";
import { useDocumentStore } from "../state/document-store.js";
import { starterDocument } from "../state/starter.js";
import { useUiStore } from "../state/ui-store.js";

export const ONBOARDED_KEY = "okeytokey.onboarded";

/**
 * First-run wizard. Three ways in, attacking the configuration learning
 * curve head-on: a scaffolded primitive → semantic starter, importing
 * existing DTCG/Tokens Studio JSON, or connecting GitHub (which opens the
 * sync dialog with the connection doctor one click away).
 */
export function Onboarding({ onConnectGitHub }: { onConnectGitHub: () => void }) {
  const hydrate = useDocumentStore((state) => state.hydrate);
  const execute = useDocumentStore((state) => state.execute);
  const setActiveSet = useUiStore((state) => state.setActiveSet);
  const fileInput = useRef<HTMLInputElement>(null);

  const finish = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
  };

  const useStarter = () => {
    const { document, themes } = starterDocument();
    hydrate(document, themes);
    setActiveSet("global");
    finish();
  };

  const importFiles = (list: FileList) => {
    void Promise.all(
      [...list].map(async (file) => ({
        name: file.name.replace(/\.json$/i, ""),
        text: await file.text(),
      })),
    ).then((files) => {
      for (const file of files) {
        execute(cmdImportSet(parseTokenSet(file.name, file.text)));
      }
      setActiveSet(files[0]?.name);
      finish();
    });
  };

  return (
    <div className="onboarding" data-testid="onboarding">
      <div className="onboarding-card">
        <h1>Welcome to okeytokey</h1>
        <p className="onboarding-lede">
          Design tokens with decisions attached. Pick a starting point — you can always import or
          connect later.
        </p>
        <div className="onboarding-options">
          <button
            type="button"
            className="onboarding-option"
            data-testid="onboard-starter"
            onClick={useStarter}
          >
            <h2>Start from a starter architecture</h2>
            <p>
              Primitive → semantic tiers with light/dark themes, scaffolded with examples. The
              fastest way to see how sets, aliases, and themes fit together.
            </p>
          </button>
          <button
            type="button"
            className="onboarding-option"
            data-testid="onboard-import"
            onClick={() => fileInput.current?.click()}
          >
            <h2>Import existing tokens</h2>
            <p>Bring DTCG or Tokens Studio JSON files. Everything round-trips losslessly.</p>
          </button>
          <button
            type="button"
            className="onboarding-option"
            data-testid="onboard-github"
            onClick={() => {
              const { document, themes } = starterDocument();
              hydrate(document, themes);
              finish();
              onConnectGitHub();
            }}
          >
            <h2>Connect GitHub</h2>
            <p>
              Pull tokens from a repository. The connection doctor checks your token, repo, branch,
              and path — and tells you exactly what to fix.
            </p>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          data-testid="onboard-import-input"
          onChange={(event) => {
            if (event.target.files && event.target.files.length > 0)
              importFiles(event.target.files);
          }}
        />
      </div>
    </div>
  );
}
