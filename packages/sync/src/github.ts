import { Octokit } from "@octokit/core";

import {
  SyncAuthError,
  SyncError,
  type DoctorReport,
  type DoctorStep,
  type PullRequestResult,
  type RemoteTokens,
  type SyncFile,
  type SyncProvider,
  type SyncTraceEntry,
  type WriteResult,
} from "./types.js";

/**
 * GitHub sync provider over the REST API (octokit core). Auth: fine-grained
 * PAT today; GitHub App installation tokens use the same interface (pass the
 * installation token as `token`). Multi-file writes go through the Git Data
 * API (tree + commit + ref) so a push is one atomic commit.
 */

export interface GitHubProviderOptions {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  /** Directory (or single .json file) holding token sets. */
  readonly path: string;
  readonly token: string;
  readonly baseUrl?: string;
  /** Injectable fetch for tests. */
  readonly fetch?: typeof globalThis.fetch;
}

interface GitHubResponse {
  status: number;
  url: string;
  headers: Record<string, string | number | undefined>;
  data: unknown;
}

export class GitHubProvider implements SyncProvider {
  readonly kind = "github";
  private readonly octokit: Octokit;
  private readonly entries: SyncTraceEntry[] = [];

  constructor(private readonly options: GitHubProviderOptions) {
    this.octokit = new Octokit({
      auth: options.token,
      baseUrl: options.baseUrl,
      request: options.fetch ? { fetch: options.fetch } : undefined,
    });
  }

  trace(): readonly SyncTraceEntry[] {
    return this.entries;
  }

  private record(
    operation: string,
    method: string,
    response: GitHubResponse | undefined,
    detail?: string,
  ): void {
    const remaining = response?.headers["x-ratelimit-remaining"];
    const reset = response?.headers["x-ratelimit-reset"];
    this.entries.push({
      operation,
      request: { method, url: response?.url ?? "" },
      status: response?.status,
      rateLimit:
        remaining !== undefined && reset !== undefined
          ? {
              remaining: Number(remaining),
              reset: new Date(Number(reset) * 1000).toISOString(),
            }
          : undefined,
      detail,
      at: new Date().toISOString(),
    });
  }

  private async request(
    operation: string,
    route: string,
    parameters: Record<string, unknown> = {},
  ): Promise<GitHubResponse> {
    const method = route.split(" ")[0] ?? "GET";
    try {
      const response = (await this.octokit.request(route, parameters)) as GitHubResponse;
      this.record(operation, method, response);
      return response;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : undefined;
      const detail = error instanceof Error ? error.message : String(error);
      this.record(operation, method, undefined, detail);
      if (status === 401 || status === 403) {
        throw new SyncAuthError(
          `${operation}: GitHub rejected the credentials (${String(status)}). ${detail}`,
          operation,
          status,
        );
      }
      throw new SyncError(`${operation}: ${detail}`, operation, status);
    }
  }

  async authenticate(): Promise<{ login: string }> {
    const response = await this.request("authenticate", "GET /user");
    const login = (response.data as { login?: string }).login;
    if (login === undefined) {
      throw new SyncAuthError("authenticate: response had no login", "authenticate");
    }
    return { login };
  }

  async listBranches(): Promise<string[]> {
    const { owner, repo } = this.options;
    const response = await this.request("listBranches", "GET /repos/{owner}/{repo}/branches", {
      owner,
      repo,
      per_page: 100,
    });
    return (response.data as { name: string }[]).map((branch) => branch.name);
  }

  async readTokens(): Promise<RemoteTokens> {
    const { owner, repo, branch, path } = this.options;
    const branchResponse = await this.request(
      "readTokens.ref",
      "GET /repos/{owner}/{repo}/branches/{branch}",
      { owner, repo, branch },
    );
    const ref = (branchResponse.data as { commit: { sha: string } }).commit.sha;

    const contents = await this.request(
      "readTokens.contents",
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path, ref },
    );

    const files: SyncFile[] = [];
    const decode = (content: string) =>
      typeof atob === "function"
        ? new TextDecoder().decode(
            Uint8Array.from(atob(content.replaceAll("\n", "")), (c) => c.codePointAt(0) ?? 0),
          )
        : Buffer.from(content, "base64").toString("utf8");

    if (Array.isArray(contents.data)) {
      const jsonEntries = (contents.data as { type: string; path: string }[]).filter(
        (entry) => entry.type === "file" && entry.path.endsWith(".json"),
      );
      for (const entry of jsonEntries) {
        const file = await this.request(
          "readTokens.file",
          "GET /repos/{owner}/{repo}/contents/{path}",
          { owner, repo, path: entry.path, ref },
        );
        files.push({
          path: entry.path,
          content: decode((file.data as { content: string }).content),
        });
      }
    } else {
      const data = contents.data as { path: string; content: string };
      files.push({ path: data.path, content: decode(data.content) });
    }
    return { files, ref };
  }

  async writeTokens(files: readonly SyncFile[], message: string): Promise<WriteResult> {
    const { owner, repo, branch } = this.options;
    // Git Data API: one atomic commit for any number of files.
    const refResponse = await this.request(
      "writeTokens.ref",
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${branch}` },
    );
    const parentSha = (refResponse.data as { object: { sha: string } }).object.sha;

    const commitResponse = await this.request(
      "writeTokens.parent",
      "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
      { owner, repo, commit_sha: parentSha },
    );
    const baseTree = (commitResponse.data as { tree: { sha: string } }).tree.sha;

    const treeResponse = await this.request(
      "writeTokens.tree",
      "POST /repos/{owner}/{repo}/git/trees",
      {
        owner,
        repo,
        base_tree: baseTree,
        tree: files.map((file) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
        })),
      },
    );

    const newCommit = await this.request(
      "writeTokens.commit",
      "POST /repos/{owner}/{repo}/git/commits",
      {
        owner,
        repo,
        message,
        tree: (treeResponse.data as { sha: string }).sha,
        parents: [parentSha],
      },
    );
    const commitSha = (newCommit.data as { sha: string }).sha;

    await this.request("writeTokens.updateRef", "PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commitSha,
    });

    return { commitSha, branch };
  }

  async createBranch(name: string, fromBranch?: string): Promise<void> {
    const { owner, repo, branch } = this.options;
    const source = fromBranch ?? branch;
    const refResponse = await this.request(
      "createBranch.ref",
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${source}` },
    );
    await this.request("createBranch.create", "POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha: (refResponse.data as { object: { sha: string } }).object.sha,
    });
  }

  async openPullRequest(options: {
    title: string;
    body?: string;
    head: string;
    base?: string;
  }): Promise<PullRequestResult> {
    const { owner, repo, branch } = this.options;
    const response = await this.request("openPullRequest", "POST /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base ?? branch,
    });
    const data = response.data as { number: number; html_url: string };
    return { number: data.number, url: data.html_url };
  }

  async healthCheck(): Promise<DoctorReport> {
    const { owner, repo, branch, path } = this.options;
    const steps: DoctorStep[] = [];
    const run = async (
      step: DoctorStep["step"],
      lookup: string,
      hint: string,
      action: () => Promise<string>,
    ): Promise<boolean> => {
      try {
        const found = await action();
        steps.push({ step, ok: true, detail: `Looked up ${lookup} → ${found}` });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.push({ step, ok: false, detail: `Looked up ${lookup} → ${message}`, hint });
        return false;
      }
    };

    const authOk = await run(
      "auth",
      "the authenticated user (GET /user)",
      "Check the token: it may be expired, revoked, or missing the Contents read/write permission.",
      async () => `signed in as "${(await this.authenticate()).login}"`,
    );
    if (!authOk) return { ok: false, steps };

    const repoOk = await run(
      "repo",
      `repository ${owner}/${repo}`,
      `Check the owner/repo spelling and that the token has access to ${owner}/${repo} (fine-grained PATs need the repository selected explicitly).`,
      async () => {
        const response = await this.request("doctor.repo", "GET /repos/{owner}/{repo}", {
          owner,
          repo,
        });
        return `found (default branch "${(response.data as { default_branch: string }).default_branch}")`;
      },
    );
    if (!repoOk) return { ok: false, steps };

    const branchOk = await run(
      "branch",
      `branch "${branch}"`,
      `Branch "${branch}" was not found. Check the branch name — the repository exists and is accessible.`,
      async () => {
        const response = await this.request(
          "doctor.branch",
          "GET /repos/{owner}/{repo}/branches/{branch}",
          { owner, repo, branch },
        );
        return `at ${(response.data as { commit: { sha: string } }).commit.sha.slice(0, 7)}`;
      },
    );
    if (!branchOk) return { ok: false, steps };

    const pathOk = await run(
      "path",
      `path "${path}" on "${branch}"`,
      `Path "${path}" does not exist on "${branch}". Create the directory/file, or fix the path setting.`,
      async () => {
        const response = await this.request(
          "doctor.path",
          "GET /repos/{owner}/{repo}/contents/{path}",
          { owner, repo, path, ref: branch },
        );
        return Array.isArray(response.data)
          ? `directory with ${String((response.data as unknown[]).length)} entries`
          : "file found";
      },
    );

    return { ok: pathOk, steps };
  }
}
