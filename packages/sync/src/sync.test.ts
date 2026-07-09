import { describe, expect, it } from "vitest";

import { createTokenDocument, parseTokenSet } from "@okeytokey/core";

import { GitHubProvider } from "./github.js";
import { mergeDocuments, resolveConflict } from "./merge.js";
import { SyncAuthError, documentToFiles, matchesProtectedPath } from "./types.js";

// ---------------------------------------------------------------------------
// GitHub provider against a scripted fetch
// ---------------------------------------------------------------------------

type Route = (init: { method: string; url: string; body?: unknown }) => {
  status: number;
  json?: unknown;
};

function scriptedFetch(routes: Record<string, Route>): typeof fetch {
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    // Octokit percent-encodes path parameters ("tokens%2Fglobal.json").
    const pathname = decodeURIComponent(new URL(url).pathname);
    const key = `${method} ${pathname}`;
    const route = routes[key];
    if (!route) {
      return Promise.resolve(
        new Response(JSON.stringify({ message: `no route for ${key}` }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const result = route({ method, url, body });
    return Promise.resolve(
      new Response(JSON.stringify(result.json ?? {}), {
        status: result.status,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": "1780000000",
        },
      }),
    );
  };
}

const OPTIONS = {
  owner: "acme",
  repo: "tokens",
  branch: "main",
  path: "tokens",
  token: "ghp_test",
};

const encode = (text: string) => Buffer.from(text, "utf8").toString("base64");

describe("GitHubProvider", () => {
  it("authenticates and records traces with rate-limit state", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({ "GET /user": () => ({ status: 200, json: { login: "vince" } }) }),
    });
    expect((await provider.authenticate()).login).toBe("vince");
    const trace = provider.trace();
    expect(trace).toHaveLength(1);
    expect(trace[0]?.operation).toBe("authenticate");
    expect(trace[0]?.status).toBe(200);
    expect(trace[0]?.rateLimit?.remaining).toBe(4999);
  });

  it("throws SyncAuthError on 401 and keeps the trace", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /user": () => ({ status: 401, json: { message: "Bad credentials" } }),
      }),
    });
    await expect(provider.authenticate()).rejects.toBeInstanceOf(SyncAuthError);
    expect(provider.trace()[0]?.detail).toContain("Bad credentials");
  });

  it("reads a token directory at a pinned ref", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /repos/acme/tokens/branches/main": () => ({
          status: 200,
          json: { commit: { sha: "abc123" } },
        }),
        "GET /repos/acme/tokens/contents/tokens": () => ({
          status: 200,
          json: [
            { type: "file", path: "tokens/global.json" },
            { type: "file", path: "tokens/readme.md" },
          ],
        }),
        "GET /repos/acme/tokens/contents/tokens/global.json": () => ({
          status: 200,
          json: {
            path: "tokens/global.json",
            content: encode('{"a":{"$type":"number","$value":1}}'),
          },
        }),
      }),
    });
    const remote = await provider.readTokens();
    expect(remote.ref).toBe("abc123");
    expect(remote.files).toHaveLength(1);
    expect(remote.files[0]?.content).toContain('"$value":1');
  });

  it("writes files as one atomic commit through the Git Data API", async () => {
    const bodies: Record<string, unknown> = {};
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /repos/acme/tokens/git/ref/heads/main": () => ({
          status: 200,
          json: { object: { sha: "parent" } },
        }),
        "GET /repos/acme/tokens/git/commits/parent": () => ({
          status: 200,
          json: { tree: { sha: "basetree" } },
        }),
        "POST /repos/acme/tokens/git/trees": ({ body }) => {
          bodies.tree = body;
          return { status: 201, json: { sha: "newtree" } };
        },
        "POST /repos/acme/tokens/git/commits": ({ body }) => {
          bodies.commit = body;
          return { status: 201, json: { sha: "newcommit" } };
        },
        "PATCH /repos/acme/tokens/git/refs/heads/main": () => ({
          status: 200,
          json: { object: { sha: "newcommit" } },
        }),
      }),
    });
    const result = await provider.writeTokens(
      [{ path: "tokens/global.json", content: "{}" }],
      "chore: sync tokens",
    );
    expect(result.commitSha).toBe("newcommit");
    expect((bodies.commit as { message: string }).message).toBe("chore: sync tokens");
    expect((bodies.tree as { tree: unknown[] }).tree).toHaveLength(1);
    expect(provider.trace().map((entry) => entry.operation)).toEqual([
      "writeTokens.ref",
      "writeTokens.parent",
      "writeTokens.tree",
      "writeTokens.commit",
      "writeTokens.updateRef",
    ]);
  });

  it("writes to a branch override instead of the configured branch", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /repos/acme/tokens/git/ref/heads/feature": () => ({
          status: 200,
          json: { object: { sha: "parent" } },
        }),
        "GET /repos/acme/tokens/git/commits/parent": () => ({
          status: 200,
          json: { tree: { sha: "basetree" } },
        }),
        "POST /repos/acme/tokens/git/trees": () => ({ status: 201, json: { sha: "newtree" } }),
        "POST /repos/acme/tokens/git/commits": () => ({
          status: 201,
          json: { sha: "newcommit" },
        }),
        "PATCH /repos/acme/tokens/git/refs/heads/feature": () => ({
          status: 200,
          json: { object: { sha: "newcommit" } },
        }),
      }),
    });
    const result = await provider.writeTokens(
      [{ path: "tokens/global.json", content: "{}" }],
      "chore: sync tokens",
      "feature",
    );
    expect(result.branch).toBe("feature");
    expect(result.commitSha).toBe("newcommit");
  });

  it("doctor pinpoints the failing step with a hint", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /user": () => ({ status: 200, json: { login: "vince" } }),
        "GET /repos/acme/tokens": () => ({ status: 200, json: { default_branch: "main" } }),
        "GET /repos/acme/tokens/branches/main": () => ({
          status: 404,
          json: { message: "Branch not found" },
        }),
      }),
    });
    const report = await provider.healthCheck();
    expect(report.ok).toBe(false);
    expect(report.steps.map((step) => [step.step, step.ok])).toEqual([
      ["auth", true],
      ["repo", true],
      ["branch", false],
    ]);
    const failed = report.steps[2];
    expect(failed?.detail).toContain('branch "main"');
    expect(failed?.hint).toContain("Check the branch name");
  });

  it("doctor reports success end-to-end", async () => {
    const provider = new GitHubProvider({
      ...OPTIONS,
      fetch: scriptedFetch({
        "GET /user": () => ({ status: 200, json: { login: "vince" } }),
        "GET /repos/acme/tokens": () => ({ status: 200, json: { default_branch: "main" } }),
        "GET /repos/acme/tokens/branches/main": () => ({
          status: 200,
          json: { commit: { sha: "abc1234def" } },
        }),
        "GET /repos/acme/tokens/contents/tokens": () => ({ status: 200, json: [{}, {}] }),
      }),
    });
    const report = await provider.healthCheck();
    expect(report.ok).toBe(true);
    expect(report.steps).toHaveLength(4);
    expect(report.steps[3]?.detail).toContain("directory with 2 entries");
  });
});

// ---------------------------------------------------------------------------
// Three-way merge
// ---------------------------------------------------------------------------

const docFrom = (json: string) => createTokenDocument([parseTokenSet("global", json)]);

describe("mergeDocuments", () => {
  const base = () =>
    docFrom(`{
      "a": { "$type": "color", "$value": "#aaaaaa" },
      "b": { "$type": "color", "$value": "#bbbbbb" },
      "c": { "$type": "color", "$value": "#cccccc" }
    }`);

  it("merges non-overlapping edits from both sides", () => {
    const ours = docFrom(`{
      "a": { "$type": "color", "$value": "#a1a1a1" },
      "b": { "$type": "color", "$value": "#bbbbbb" },
      "c": { "$type": "color", "$value": "#cccccc" }
    }`);
    const theirs = docFrom(`{
      "a": { "$type": "color", "$value": "#aaaaaa" },
      "b": { "$type": "color", "$value": "#b2b2b2" },
      "c": { "$type": "color", "$value": "#cccccc" },
      "d": { "$type": "color", "$value": "#dddddd" }
    }`);
    const result = mergeDocuments(base(), ours, theirs);
    expect(result.conflicts).toHaveLength(0);
    const tokens = result.document.sets.get("global")?.tokens;
    expect(tokens?.get("a")?.value).toBe("#a1a1a1"); // ours
    expect(tokens?.get("b")?.value).toBe("#b2b2b2"); // theirs
    expect(tokens?.get("d")?.value).toBe("#dddddd"); // their addition
  });

  it("takes their deletions when we did not touch the token", () => {
    const ours = base();
    const theirs = docFrom(`{
      "a": { "$type": "color", "$value": "#aaaaaa" },
      "c": { "$type": "color", "$value": "#cccccc" }
    }`);
    const result = mergeDocuments(base(), ours, theirs);
    expect(result.conflicts).toHaveLength(0);
    expect(result.document.sets.get("global")?.tokens.has("b")).toBe(false);
  });

  it("reports conflicts when both sides changed the same token differently", () => {
    const ours = docFrom('{ "a": { "$type": "color", "$value": "#111111" } }');
    const theirs = docFrom('{ "a": { "$type": "color", "$value": "#222222" } }');
    const smallBase = docFrom('{ "a": { "$type": "color", "$value": "#aaaaaa" } }');
    const result = mergeDocuments(smallBase, ours, theirs);
    expect(result.conflicts).toEqual([
      { setName: "global", path: "a", base: "#aaaaaa", ours: "#111111", theirs: "#222222" },
    ]);
    // Merged document keeps ours until the conflict is resolved.
    expect(result.document.sets.get("global")?.tokens.get("a")?.value).toBe("#111111");

    const picked = resolveConflict(result.document, result.conflicts[0] as never, "theirs");
    expect(picked.sets.get("global")?.tokens.get("a")?.value).toBe("#222222");
  });

  it("edit-vs-delete is a conflict", () => {
    const smallBase = docFrom('{ "a": { "$type": "color", "$value": "#aaaaaa" } }');
    const ours = docFrom('{ "a": { "$type": "color", "$value": "#111111" } }');
    const theirs = docFrom("{}");
    const result = mergeDocuments(smallBase, ours, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.theirs).toBeUndefined();
    // Picking "theirs" deletes the token.
    const picked = resolveConflict(result.document, result.conflicts[0] as never, "theirs");
    expect(picked.sets.get("global")?.tokens.has("a")).toBe(false);
  });

  it("metadata-only changes merge too", () => {
    const smallBase = docFrom('{ "a": { "$type": "color", "$value": "#aaaaaa" } }');
    const ours = smallBase;
    const theirs = docFrom(
      '{ "a": { "$type": "color", "$value": "#aaaaaa", "$description": "Updated" } }',
    );
    const result = mergeDocuments(smallBase, ours, theirs);
    expect(result.conflicts).toHaveLength(0);
    expect(result.document.sets.get("global")?.tokens.get("a")?.description).toBe("Updated");
  });

  it("handles whole-set additions and clean deletions", () => {
    const ours = createTokenDocument([
      parseTokenSet("global", '{ "a": { "$type": "number", "$value": 1 } }'),
      parseTokenSet("brand", '{ "x": { "$type": "number", "$value": 9 } }'),
    ]);
    const smallBase = docFrom('{ "a": { "$type": "number", "$value": 1 } }');
    const theirs = createTokenDocument([]);
    const result = mergeDocuments(smallBase, ours, theirs);
    // They deleted "global" (unchanged on our side) -> gone; our new set stays.
    expect([...result.document.sets.keys()]).toEqual(["brand"]);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("matchesProtectedPath", () => {
  it("matches an exact path", () => {
    expect(matchesProtectedPath("colors.primary.500", ["colors.primary.500"])).toBe(true);
    expect(matchesProtectedPath("colors.primary.600", ["colors.primary.500"])).toBe(false);
  });

  it("* matches exactly one segment", () => {
    expect(matchesProtectedPath("colors.blue", ["colors.*"])).toBe(true);
    expect(matchesProtectedPath("colors.primary.500", ["colors.*"])).toBe(false);
    expect(matchesProtectedPath("colors", ["colors.*"])).toBe(false);
  });

  it("** matches one or more segments", () => {
    expect(matchesProtectedPath("colors.blue", ["colors.**"])).toBe(true);
    expect(matchesProtectedPath("colors.primary.500", ["colors.**"])).toBe(true);
    expect(matchesProtectedPath("spacing.base", ["colors.**"])).toBe(false);
  });

  it("** at the root matches any path", () => {
    expect(matchesProtectedPath("colors.blue", ["**"])).toBe(true);
    expect(matchesProtectedPath("colors.primary.500", ["**"])).toBe(true);
  });

  it("returns true when any pattern matches", () => {
    expect(matchesProtectedPath("spacing.base", ["colors.**", "spacing.*"])).toBe(true);
    expect(matchesProtectedPath("typography.heading", ["colors.**", "spacing.*"])).toBe(false);
  });

  it("returns false for an empty pattern list", () => {
    expect(matchesProtectedPath("colors.blue", [])).toBe(false);
  });
});

describe("documentToFiles", () => {
  it("maps sets to repo paths", () => {
    const document = createTokenDocument([
      parseTokenSet("global", "{}"),
      parseTokenSet("dark", "{}"),
    ]);
    const files = documentToFiles(document, "tokens", () => "{}");
    expect(files.map((file) => file.path)).toEqual(["tokens/global.json", "tokens/dark.json"]);
  });
});
