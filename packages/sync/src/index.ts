/**
 * @okeytokey/sync — sync provider abstraction + GitHub implementation.
 *
 * Phase 0 scaffold: the `SyncProvider` interface, GitHub (octokit) provider,
 * connection doctor, and structured diagnostics land in Phase 4.
 */

/** Providers okeytokey ships or plans to ship. GitHub is first-party in v1. */
export const SYNC_PROVIDER_KINDS = ["github", "gitlab", "azure-devops", "bitbucket"] as const;

export type SyncProviderKind = (typeof SYNC_PROVIDER_KINDS)[number];
