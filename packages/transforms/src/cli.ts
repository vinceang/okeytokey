#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";

import {
  createTokenDocument,
  diffDocuments,
  lintDocument,
  parseTokenSet,
  type LintConfig,
} from "@okeytokey/core";

import { build, loadConfig, loadDocument } from "./build.js";

/**
 * okeytokey CLI — build, lint, and diff token sets without the studio.
 *
 *   okeytokey build [config]          produce output artifacts
 *   okeytokey lint [config]           run lint rules; exit 1 on errors
 *   okeytokey diff <ref> [config]     semantic diff vs a git ref (tag, sha, branch)
 */

const [, , command, ...args] = process.argv;

function usage(): never {
  console.log(
    [
      "Usage:",
      "  okeytokey build [okeytokey.config.json]",
      "  okeytokey lint  [okeytokey.config.json]",
      "  okeytokey diff  <ref> [okeytokey.config.json]",
    ].join("\n"),
  );
  process.exit(command === undefined || command === "--help" ? 0 : 1);
}

async function runBuild(configPath: string) {
  const result = await build(configPath);
  for (const file of result.files) {
    console.log(`✓ ${file.path} (${String(file.bytes)} bytes)`);
  }
}

async function runLint(configPath: string) {
  const config = await loadConfig(configPath);
  const document = await loadDocument(config, dirname(resolve(configPath)));
  const lintConfig = (config.lint ? { rules: config.lint } : {}) as LintConfig;
  const diagnostics = lintDocument(document, lintConfig);

  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    const prefix = d.severity === "error" ? "error" : "warn ";
    const path = d.tokenPath || "(config)";
    console.log(`${path}  ${prefix}  ${d.ruleId}  ${d.message}`);
    if (d.severity === "error") errors++;
    else warnings++;
  }

  const summary = [
    errors > 0 ? `${String(errors)} error${errors === 1 ? "" : "s"}` : "",
    warnings > 0 ? `${String(warnings)} warning${warnings === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  if (summary) console.log(`\n${summary}`);
  if (errors > 0) process.exit(1);
}

async function runDiff(ref: string, configPath: string) {
  const config = await loadConfig(configPath);
  const baseDir = dirname(resolve(configPath));
  const after = await loadDocument(config, baseDir);

  // Read each set file at <ref> via git show. Falls back gracefully when a
  // file didn't exist at that ref (new file → empty set).
  const beforeSets = config.sets.map((setPath) => {
    const absPath = resolve(baseDir, setPath);
    const repoRelative = absPath.replace(
      `${execSync("git rev-parse --show-toplevel").toString().trim()}/`,
      "",
    );
    try {
      const content = execSync(`git show ${ref}:${repoRelative}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return parseTokenSet(basename(setPath, ".json"), content);
    } catch {
      return parseTokenSet(basename(setPath, ".json"), "{}");
    }
  });
  const before = createTokenDocument(beforeSets);
  const diff = diffDocuments(before, after);

  let changed = false;
  for (const set of diff.sets) {
    for (const change of set.changes) {
      changed = true;
      const tag =
        change.kind === "added"
          ? "+"
          : change.kind === "removed"
            ? "-"
            : change.kind === "renamed"
              ? "~"
              : "~";
      const label = change.kind === "renamed" ? `${change.path} → ${change.toPath}` : change.path;
      console.log(`${tag} ${set.setName} · ${label}  [${change.kind}]`);
    }
  }

  for (const name of diff.addedSets) {
    changed = true;
    console.log(`+ (set) ${name}  [added]`);
  }
  for (const name of diff.removedSets) {
    changed = true;
    console.log(`- (set) ${name}  [removed]`);
  }

  if (!changed) {
    console.log(`No token changes vs ${ref}`);
    return;
  }

  const downstream = diff.downstreamPaths.length;
  if (downstream > 0) {
    console.log(
      `\n${String(downstream)} downstream token${downstream === 1 ? "" : "s"} affected by resolved-value changes`,
    );
  }
}

switch (command) {
  case "build": {
    const configPath = args[0] ?? "okeytokey.config.json";
    runBuild(configPath).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
    break;
  }
  case "lint": {
    const configPath = args[0] ?? "okeytokey.config.json";
    runLint(configPath).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
    break;
  }
  case "diff": {
    const ref = args[0];
    if (!ref) {
      console.error("diff requires a <ref> argument (commit sha, tag, or branch)");
      process.exit(1);
    }
    const configPath = args[1] ?? "okeytokey.config.json";
    runDiff(ref, configPath).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
    break;
  }
  default:
    usage();
}
