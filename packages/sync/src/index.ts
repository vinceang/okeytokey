/**
 * @okeytokey/sync — Git sync layer. Provider abstraction + GitHub
 * implementation, diagnostics-first: structured traces, a connection doctor
 * that pinpoints the failing step, and token-level three-way merge.
 */

export const SYNC_PROVIDER_KINDS = ["github", "gitlab", "azure-devops", "bitbucket"] as const;
export type SyncProviderKind = (typeof SYNC_PROVIDER_KINDS)[number];

export {
  SyncAuthError,
  SyncError,
  documentToFiles,
  type DoctorReport,
  type DoctorStep,
  type PullRequestResult,
  type RemoteTokens,
  type SyncFile,
  type SyncProvider,
  type SyncTraceEntry,
  type WriteResult,
} from "./types.js";

export { GitHubProvider, type GitHubProviderOptions } from "./github.js";

export { mergeDocuments, resolveConflict, type MergeConflict, type MergeResult } from "./merge.js";
