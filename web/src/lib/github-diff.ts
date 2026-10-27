import {
  fetchGithubCommitDiff,
  fetchGithubComparison,
  fetchGithubPRComparison,
  fetchGithubSingleBranchComparison,
  fetchGithubFile,
  type GithubDiff,
  type GithubDiffResult,
} from "#lib/github-api.ts";
import type { GithubDiffSource } from "#lib/github-url.ts";
import { makeImageDetails } from "#lib/file-details.ts";
import { parseMultiFilePatch } from "#lib/multi-file-patch.ts";

export function fetchGithubDiff(
  token: string | null,
  source: GithubDiffSource,
): GithubDiffResult | Promise<GithubDiffResult> {
  switch (source.kind) {
    case "commit":
      return fetchGithubCommitDiff(token, source.owner, source.repo, source.sha);
    case "pull":
      return fetchGithubPRComparison(token, source.owner, source.repo, source.prNumber);
    case "pull-commit":
      return fetchGithubCommitDiff(token, source.owner, source.repo, source.sha, source.backlink);
    case "compare":
      return fetchGithubComparison(token, source.owner, source.repo, source.base, source.head);
    case "compare-single":
      return fetchGithubSingleBranchComparison(token, source.owner, source.repo, source.head);
    default: {
      const _exhaustive: never = source;
      throw new Error(`Unhandled GithubDiffSource kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function parseMultiFilePatchGithub(
  token: string | null,
  details: GithubDiff,
  patch: string,
  onTotalCount: (total: number) => void,
) {
  return parseMultiFilePatch(patch, onTotalCount, (from, to, status) => {
    return makeImageDetails(
      from,
      to,
      status,
      status != "added" ? fetchGithubFile(token, details.owner, details.repo, from, details.base) : undefined,
      status != "removed" ? fetchGithubFile(token, details.owner, details.repo, to, details.head) : undefined,
    );
  });
}
