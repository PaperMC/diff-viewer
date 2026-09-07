const INVALID_URL_MESSAGE = "Invalid GitHub URL. Use: https://github.com/owner/repo/(commit|pull|compare)/(id|ref|ref_a...ref_b)";

export type GithubDiffSource =
    | { kind: "commit"; url: string; owner: string; repo: string; sha: string }
    | { kind: "pull"; url: string; owner: string; repo: string; prNumber: string }
    | { kind: "pull-commit"; url: string; owner: string; repo: string; prNumber: string; sha: string; backlink: string }
    | { kind: "compare"; url: string; owner: string; repo: string; base: string; head: string }
    | { kind: "compare-single"; url: string; owner: string; repo: string; head: string }
    | { kind: "invalid"; message: string };

// Parses a GitHub URL into the request that should be made against the GitHub API.
export function parseGithubUrl(url: string): GithubDiffSource {
    let path: string;
    try {
        const parsed = new URL(url);
        // exclude hash + query params
        path = parsed.protocol + "//" + parsed.hostname + parsed.pathname;
    } catch {
        return { kind: "invalid", message: INVALID_URL_MESSAGE };
    }

    const match = path.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(commit|pull|compare)\/(.+)/);
    if (!match) {
        return { kind: "invalid", message: INVALID_URL_MESSAGE };
    }
    const [, owner, repo, type, id] = match;

    if (type === "commit") {
        return { kind: "commit", url: path, owner, repo, sha: id.split("/")[0] };
    }
    if (type === "pull") {
        const segments = id.split("/");
        // Support PR-specific commit links like /pull/50/commits/<sha>
        if (segments.length >= 3 && segments[1] === "commits" && segments[2]) {
            return {
                kind: "pull-commit",
                url: path,
                owner,
                repo,
                prNumber: segments[0],
                sha: segments[2],
                backlink: `https://github.com/${owner}/${repo}/pull/${segments[0]}/commits/${segments[2]}`,
            };
        }
        return { kind: "pull", url: path, owner, repo, prNumber: segments[0] };
    }

    // GitHub also supports .diff/.patch suffixes and trailing slashes, strip them
    const cleaned = id.replace(/\/+$/, "").replace(/\.(diff|patch)$/, "");
    const invalidMessage = `Invalid comparison URL. '${id}' does not match format 'ref_a...ref_b', 'ref_a..ref_b', or 'ref'`;
    const separator = cleaned.includes("...") ? "..." : cleaned.includes("..") ? ".." : null;
    if (separator) {
        const parts = cleaned.split(separator);
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return { kind: "invalid", message: invalidMessage };
        }
        return { kind: "compare", url: path, owner, repo, base: parts[0], head: parts[1] };
    }
    // Single-branch form: /compare/<head> compares the default branch against <head>
    if (cleaned) {
        return { kind: "compare-single", url: path, owner, repo, head: cleaned };
    }
    return { kind: "invalid", message: invalidMessage };
}
