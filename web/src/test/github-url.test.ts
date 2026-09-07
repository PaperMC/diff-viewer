import { expect, test } from "vitest";
import { parseGithubUrl } from "$lib/github-url";

const GITHUB = "https://github.com/octocat/repo";

test.for([
  { url: `${GITHUB}/commit/abc123`, expected: { kind: "commit", owner: "octocat", repo: "repo", sha: "abc123" } },
  { url: `${GITHUB}/commit/abc123/files`, expected: { kind: "commit", sha: "abc123" } },
  { url: `${GITHUB}/pull/50`, expected: { kind: "pull", prNumber: "50" } },
  { url: `${GITHUB}/pull/50/files`, expected: { kind: "pull", prNumber: "50" } },
  { url: `${GITHUB}/pull/50/commits`, expected: { kind: "pull", prNumber: "50" } },
  { url: `${GITHUB}/compare/main...feature`, expected: { kind: "compare", base: "main", head: "feature" } },
  { url: `${GITHUB}/compare/main..feature`, expected: { kind: "compare", base: "main", head: "feature" } },
  { url: `${GITHUB}/compare/v1.0...v2.0`, expected: { kind: "compare", base: "v1.0", head: "v2.0" } },
  { url: `${GITHUB}/compare/main...feature/foo`, expected: { kind: "compare", base: "main", head: "feature/foo" } },
  { url: `${GITHUB}/compare/main...feature.diff`, expected: { kind: "compare", base: "main", head: "feature" } },
  { url: `${GITHUB}/compare/main...feature.patch/`, expected: { kind: "compare", base: "main", head: "feature" } },
  { url: `${GITHUB}/compare/v1.0`, expected: { kind: "compare-single", head: "v1.0" } },
  { url: `${GITHUB}/compare/feature/foo`, expected: { kind: "compare-single", head: "feature/foo" } },
  { url: `${GITHUB}/compare/main/`, expected: { kind: "compare-single", head: "main" } },
])("parses $url", ({ url, expected }) => {
  expect(parseGithubUrl(url)).toMatchObject(expected);
});

test("PR-specific commit links point back to the PR, not the canonical commit", () => {
  expect(parseGithubUrl(`${GITHUB}/pull/50/commits/abc123`)).toEqual({
    kind: "pull-commit",
    url: `${GITHUB}/pull/50/commits/abc123`,
    owner: "octocat",
    repo: "repo",
    prNumber: "50",
    sha: "abc123",
    backlink: "https://github.com/octocat/repo/pull/50/commits/abc123",
  });
});

test("query strings and hash fragments are ignored", () => {
  expect(parseGithubUrl(`${GITHUB}/pull/50/commits/abc123?w=1#files`)).toEqual({
    kind: "pull-commit",
    url: `${GITHUB}/pull/50/commits/abc123`,
    owner: "octocat",
    repo: "repo",
    prNumber: "50",
    sha: "abc123",
    backlink: "https://github.com/octocat/repo/pull/50/commits/abc123",
  });
});

test.for([
  `${GITHUB}/compare/...main`,
  `${GITHUB}/compare/main..`,
  `${GITHUB}/compare/`,
  "https://gitlab.com/octocat/repo/compare/main...feature",
  "not a url",
])("rejects %s", (url) => {
  expect(parseGithubUrl(url).kind).toBe("error");
});

test("compare rejections explain the expected format", () => {
  const invalid = parseGithubUrl(`${GITHUB}/compare/...main`);
  if (invalid.kind === "error") {
    expect(invalid.message).toMatch(/Invalid comparison URL/);
  }
});

test("non-GitHub URLs are rejected with guidance", () => {
  const invalid = parseGithubUrl("https://gitlab.com/octocat/repo/compare/main...feature");
  if (invalid.kind === "error") {
    expect(invalid.message).toMatch(/Invalid GitHub URL/);
  }
});
