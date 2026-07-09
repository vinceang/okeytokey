import type { TokenDocument } from "@okeytokey/core";

/**
 * The provider abstraction. GitHub ships first; GitLab / Azure DevOps /
 * Bitbucket implement the same interface later. Every operation appends a
 * structured trace entry — reliability and debuggability first.
 */

export interface SyncTraceEntry {
  readonly operation: string;
  readonly request: { readonly method: string; readonly url: string };
  readonly status: number | undefined;
  /** GitHub rate-limit state at response time, when available. */
  readonly rateLimit?: { readonly remaining: number; readonly reset: string };
  readonly detail?: string;
  readonly at: string;
}

export interface SyncFile {
  /** Repo-relative path, e.g. "tokens/global.json". */
  readonly path: string;
  /** File text (DTCG JSON). */
  readonly content: string;
}

export interface RemoteTokens {
  readonly files: readonly SyncFile[];
  /** Commit sha the files were read at. */
  readonly ref: string;
}

export interface WriteResult {
  readonly commitSha: string;
  readonly branch: string;
}

export interface PullRequestResult {
  readonly number: number;
  readonly url: string;
}

export interface DoctorStep {
  readonly step: "auth" | "repo" | "branch" | "path";
  readonly ok: boolean;
  /** What was looked up and what came back. */
  readonly detail: string;
  /** The most likely fix when the step failed. */
  readonly hint?: string;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly steps: readonly DoctorStep[];
}

export interface SyncProvider {
  readonly kind: string;
  authenticate(): Promise<{ login: string }>;
  listBranches(): Promise<string[]>;
  readTokens(): Promise<RemoteTokens>;
  /** Write files as one atomic commit. Pass `branch` to target a branch other than the configured one. */
  writeTokens(files: readonly SyncFile[], message: string, branch?: string): Promise<WriteResult>;
  createBranch(name: string, fromBranch?: string): Promise<void>;
  openPullRequest(options: {
    title: string;
    body?: string;
    head: string;
    base?: string;
  }): Promise<PullRequestResult>;
  healthCheck(): Promise<DoctorReport>;
  /** The structured trace of every operation this provider instance ran. */
  trace(): readonly SyncTraceEntry[];
}

/**
 * Returns true if `tokenPath` matches any of the CODEOWNERS-style glob patterns.
 * Segments are dot-separated. `*` matches exactly one segment; `**` matches one
 * or more segments.
 *
 * Examples:
 *   "colors.*"   matches "colors.blue" but not "colors.primary.500"
 *   "colors.**"  matches "colors.blue" and "colors.primary.500"
 *   "**"         matches any path
 */
export function matchesProtectedPath(tokenPath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const parts = pattern.split(".");
    let regexStr = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? "";
      const sep = i === 0 ? "" : "\\.";
      if (part === "**") {
        regexStr += `${sep}[^.]+(\\.[^.]+)*`;
      } else if (part === "*") {
        regexStr += `${sep}[^.]+`;
      } else {
        regexStr += `${sep}${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      }
    }
    return new RegExp(`^${regexStr}$`).test(tokenPath);
  });
}

export class SyncError extends Error {
  override readonly name: string = "SyncError";
  constructor(
    message: string,
    readonly operation: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class SyncAuthError extends SyncError {
  override readonly name = "SyncAuthError";
}

/** Serialize a document's sets into repo files under a base path. */
export function documentToFiles(
  document: TokenDocument,
  basePath: string,
  serialize: (setName: string) => string,
): SyncFile[] {
  const prefix = basePath === "" || basePath.endsWith("/") ? basePath : `${basePath}/`;
  return [...document.sets.keys()].map((name) => ({
    path: `${prefix}${name}.json`,
    content: serialize(name),
  }));
}
