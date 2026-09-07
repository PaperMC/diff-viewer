import type { components } from "@octokit/openapi-types";
import { trimCommitHash } from "$lib/util";

export interface GithubDiff {
  owner: string;
  repo: string;
  base: string;
  head: string;
  description: string;
  backlink: string;
}

export interface GithubDiffResult {
  info: Promise<GithubDiff>;
  response: Promise<string>;
}

export type GithubPR = components["schemas"]["pull-request"];
export type GithubCommitDetails = components["schemas"]["commit"];
export type GithubUser = components["schemas"]["private-user"];

export async function fetchCurrentGithubUser(token: string): Promise<GithubUser> {
  const response = await fetch(`https://api.github.com/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.ok) {
    return await response.json();
  } else {
    throw Error(`Failed to retrieve user (${response.status}): ${await response.text()}`);
  }
}

export async function fetchGithubPRComparison(
  token: string | null,
  owner: string,
  repo: string,
  prNumber: string,
): Promise<GithubDiffResult> {
  const prInfo = await fetchGithubPRInfo(token, owner, repo, prNumber);
  const base = prInfo.base.sha;
  const head = prInfo.head.sha;
  const title = `${prInfo.title} (#${prInfo.number})`;
  return fetchGithubComparison(token, owner, repo, base, head, title, prInfo.html_url);
}

function injectOptionalToken(token: string | null, opts: RequestInit) {
  if (token) {
    opts.headers = {
      ...opts.headers,
      Authorization: `Bearer ${token}`,
    };
  }
}

async function fetchGithubPRInfo(
  token: string | null,
  owner: string,
  repo: string,
  prNumber: string,
): Promise<GithubPR> {
  const opts: RequestInit = {
    headers: {
      Accept: "application/json",
    },
  };
  injectOptionalToken(token, opts);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, opts);
  if (response.ok) {
    return await response.json();
  } else {
    throw Error(`Failed to retrieve PR info (${response.status}): ${await response.text()}`);
  }
}

export function fetchGithubComparison(
  token: string | null,
  owner: string,
  repo: string,
  base: string,
  head: string,
  description?: string,
  url?: string,
): GithubDiffResult {
  return {
    info: (async () => {
      if (!url) {
        url = `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
      }
      if (!description) {
        description = `Comparing ${trimCommitHash(base)}...${trimCommitHash(head)}`;
      }
      return { owner, repo, base, head, description, backlink: url };
    })(),
    response: (async () => {
      const opts: RequestInit = {
        headers: {
          Accept: "application/vnd.github.v3.diff",
        },
      };
      injectOptionalToken(token, opts);
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`, opts);
      if (!response.ok) {
        throw Error(`Failed to retrieve comparison (${response.status}): ${await response.text()}`);
      }
      return await response.text();
    })(),
  };
}

export async function fetchRepoDefaultBranch(token: string | null, owner: string, repo: string): Promise<string> {
  const opts: RequestInit = {
    headers: {
      Accept: "application/vnd.github+json",
    },
  };
  injectOptionalToken(token, opts);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, opts);
  if (!response.ok) {
    throw Error(`Failed to retrieve repo info (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  if (!data.default_branch) {
    throw Error(`Repository info is missing default branch`);
  }
  return data.default_branch as string;
}

// Supports GitHub's single-branch compare URLs (https://github.com/owner/repo/compare/<head>),
// which compare the default branch against <head>.
export async function fetchGithubSingleBranchComparison(
  token: string | null,
  owner: string,
  repo: string,
  head: string,
): Promise<GithubDiffResult> {
  const base = await fetchRepoDefaultBranch(token, owner, repo);
  return fetchGithubComparison(token, owner, repo, base, head);
}

export function fetchGithubCommitDiff(
  token: string | null,
  owner: string,
  repo: string,
  commit: string,
  backlinkOverride?: string,
): GithubDiffResult {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commit}`;
  return {
    info: (async () => {
      const metaOpts: RequestInit = {
        headers: {
          Accept: "application/vnd.github+json",
        },
      };
      injectOptionalToken(token, metaOpts);
      const metaResponse = await fetch(url, metaOpts);
      if (!metaResponse.ok) {
        throw Error(`Failed to retrieve commit meta (${metaResponse.status}): ${await metaResponse.text()}`);
      }
      const meta: GithubCommitDetails = await metaResponse.json();
      const firstParent = meta.parents[0].sha;
      const description = `${meta.commit.message.split("\n")[0]} (${trimCommitHash(commit)})`;
      return { owner, repo, base: firstParent, head: commit, description, backlink: backlinkOverride ?? meta.html_url };
    })(),
    response: (async () => {
      const diffOpts: RequestInit = {
        headers: {
          Accept: "application/vnd.github.v3.diff",
        },
      };
      injectOptionalToken(token, diffOpts);
      const response = await fetch(url, diffOpts);
      if (!response.ok) {
        throw Error(`Failed to retrieve commit diff (${response.status}): ${await response.text()}`);
      }
      return await response.text();
    })(),
  };
}

export async function fetchGithubFile(
  token: string | null,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<Blob> {
  const opts: RequestInit = {
    headers: {
      Accept: "application/vnd.github.v3.raw",
    },
  };
  injectOptionalToken(token, opts);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, opts);
  if (response.ok) {
    return await response.blob();
  } else {
    throw Error(`Failed to retrieve file (${response.status}): ${await response.text()}`);
  }
}
