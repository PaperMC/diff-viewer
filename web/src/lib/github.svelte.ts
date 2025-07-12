import { browser } from "$app/environment";
import type { components } from "@octokit/openapi-types";
import { splitMultiFilePatch, trimCommitHash } from "$lib/util";
import { type FileDetails, makeImageDetails } from "$lib/diff-viewer-multi-file.svelte";
import { PUBLIC_GITHUB_APP_NAME, PUBLIC_GITHUB_CLIENT_ID } from "$env/static/public";

export const GITHUB_USERNAME_KEY = "github_username";
export const GITHUB_TOKEN_KEY = "github_token";
export const GITHUB_TOKEN_EXPIRES_KEY = "github_token_expires";
export const GITHUB_URL_PARAM = "github_url";
export const GITHUB_API_BASE_URL = "https://api.github.com";

export const githubUsername: { value: string | null } = $state({ value: null });

export type GithubDiff = {
    owner: string;
    repo: string;
    base: string;
    head: string;
    description: string;
    backlink: string;
    prNumber?: string;
};

export type GithubDiffResult = {
    info: GithubDiff;
    files: FileDetails[];
};

if (browser) {
    githubUsername.value = localStorage.getItem(GITHUB_USERNAME_KEY);
}

export function getGithubUsername(): string | null {
    return githubUsername.value;
}

export function getGithubToken(): string | null {
    const expiresAt = localStorage.getItem(GITHUB_TOKEN_EXPIRES_KEY);
    if (expiresAt !== null) {
        const expiresIn = parseInt(expiresAt) - Date.now();
        if (expiresIn <= 0) {
            logoutGithub();
            return null;
        }
    }
    return localStorage.getItem(GITHUB_TOKEN_KEY);
}

export function loginWithGithub() {
    if (getGithubUsername()) {
        return;
    }
    localStorage.setItem("authReferrer", window.location.pathname);
    const params = new URLSearchParams({
        client_id: PUBLIC_GITHUB_CLIENT_ID,
        redirect_uri: window.location.origin + "/github-callback",
    });
    window.location.href = "https://github.com/login/oauth/authorize?" + params.toString();
}

export function logoutGithub() {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    localStorage.removeItem(GITHUB_TOKEN_EXPIRES_KEY);
    localStorage.removeItem(GITHUB_USERNAME_KEY);
    githubUsername.value = null;
}

export function installGithubApp() {
    localStorage.setItem("authReferrer", window.location.href);
    window.location.href = `https://github.com/apps/${PUBLIC_GITHUB_APP_NAME}/installations/new`;
}

export type GithubPR = components["schemas"]["pull-request"];
export type FileStatus = "added" | "removed" | "modified" | "renamed" | "renamed_modified";
export type GithubUser = components["schemas"]["private-user"];
export type GithubCommitDetails = components["schemas"]["commit"];
export type GithubPRComment = components["schemas"]["pull-request-review-comment"];
export type GithubTokenResponse = {
    access_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
};

export async function fetchGithubUserToken(code: string): Promise<GithubTokenResponse> {
    const response = await fetch(new URL(`${window.location.origin}/github-token?code=${code}`), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (response.ok) {
        return await response.json();
    } else {
        throw Error(`Failed to retrieve token (${response.status}): ${await response.text()}`);
    }
}

export async function fetchCurrentGithubUser(token: string): Promise<GithubUser> {
    return await makeGithubRequest(token, `/user`, "GET", {
        requireAuth: true,
        operationName: "retrieve user",
    });
}

export async function fetchGithubPRComparison(token: string | null, owner: string, repo: string, prNumber: string): Promise<GithubDiffResult> {
    const prInfo = await fetchGithubPRInfo(token, owner, repo, prNumber);
    const base = prInfo.base.sha;
    const head = prInfo.head.sha;
    const title = `${prInfo.title} (#${prInfo.number})`;
    const result = await fetchGithubComparison(token, owner, repo, base, head, title, prInfo.html_url);

    return {
        ...result,
        info: {
            ...result.info,
            prNumber: prNumber,
        },
    };
}

export async function fetchGithubPRInfo(token: string | null, owner: string, repo: string, prNumber: string): Promise<GithubPR> {
    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/${prNumber}`, "GET", {
        accept: "application/json",
        operationName: "retrieve PR info",
    });
}

function splitMultiFilePatchGithub(details: GithubDiff, patch: string) {
    return splitMultiFilePatch(patch, (from, to, status) => {
        const token = getGithubToken();
        return makeImageDetails(
            from,
            to,
            status,
            status != "added" ? fetchGithubFile(token, details.owner, details.repo, from, details.base) : undefined,
            status != "removed" ? fetchGithubFile(token, details.owner, details.repo, to, details.head) : undefined,
        );
    });
}

export async function fetchGithubComparison(
    token: string | null,
    owner: string,
    repo: string,
    base: string,
    head: string,
    description?: string,
    url?: string,
): Promise<GithubDiffResult> {
    const diffText = await makeGithubRequest<string>(token, `/repos/${owner}/${repo}/compare/${base}...${head}`, "GET", {
        accept: "application/vnd.github.v3.diff",
        responseType: "text",
        operationName: "retrieve comparison",
    });

    if (!description) {
        description = `Comparing ${trimCommitHash(base)}...${trimCommitHash(head)}`;
    }
    if (!url) {
        url = `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
    }
    const info = { owner, repo, base, head, description, backlink: url };
    return { files: splitMultiFilePatchGithub(info, diffText), info };
}

export async function fetchGithubCommitDiff(token: string | null, owner: string, repo: string, commit: string): Promise<GithubDiffResult> {
    const path = `/repos/${owner}/${repo}/commits/${commit}`;

    const [diffText, meta] = await Promise.all([
        makeGithubRequest<string>(token, path, "GET", {
            accept: "application/vnd.github.v3.diff",
            responseType: "text",
            operationName: "retrieve commit diff",
        }),
        makeGithubRequest<GithubCommitDetails>(token, path, "GET", {
            operationName: "retrieve commit meta",
        }),
    ]);

    const firstParent = meta.parents[0].sha;
    const description = `${meta.commit.message.split("\n")[0]} (${trimCommitHash(commit)})`;
    const info = { owner, repo, base: firstParent, head: commit, description, backlink: meta.html_url };
    return {
        files: splitMultiFilePatchGithub(info, diffText),
        info,
    };
}

export async function fetchGithubFile(token: string | null, owner: string, repo: string, path: string, ref: string): Promise<Blob> {
    return await makeGithubRequest<Blob>(token, `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, "GET", {
        accept: "application/vnd.github.v3.raw",
        responseType: "blob",
        operationName: "retrieve file",
    });
}

export async function fetchGithubPRComments(token: string | null, owner: string, repo: string, prNumber: string): Promise<GithubPRComment[]> {
    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/${prNumber}/comments`, "GET", {
        operationName: "retrieve PR comments",
    });
}

async function makeGithubRequest<T = void>(
    token: string | null,
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    options?: {
        body?: object;
        accept?: string;
        responseType?: "json" | "text" | "blob";
        requireAuth?: boolean;
        operationName?: string;
    },
): Promise<T> {
    const { body, accept = "application/vnd.github+json", responseType = "json", requireAuth = false, operationName } = options || {};

    if (requireAuth && !token) {
        throw Error(`Authentication required to ${operationName || "perform this operation"}`);
    }

    const opts: RequestInit = {
        method,
        headers: {
            Accept: accept,
            ...(method !== "GET" && { "X-GitHub-Api-Version": "2022-11-28" }),
            ...(body && { "Content-Type": "application/json" }),
        },
    };

    if (token) {
        opts.headers = {
            ...opts.headers,
            Authorization: `Bearer ${token}`,
        };
    }

    if (body) {
        opts.body = JSON.stringify(body);
    }

    const url = `${GITHUB_API_BASE_URL}${path}`;
    const response = await fetch(url, opts);

    if (response.ok) {
        if (method === "DELETE") {
            return undefined as T;
        }
        switch (responseType) {
            case "json":
                return await response.json();
            case "text":
                return (await response.text()) as T;
            case "blob":
                return (await response.blob()) as T;
            default:
                return await response.json();
        }
    } else {
        const errorText = await response.text();
        console.error("GitHub API Error:", response.status, errorText);

        // Provide more specific error messages for common issues
        if (response.status === 422) {
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.message?.includes("pull request review comment line")) {
                    throw Error("Cannot add comment to this line. The line may not be part of the diff or may be unchanged.");
                }
                throw Error(`GitHub API validation error: ${errorData.message || errorText}`);
            } catch {
                throw Error(`GitHub API validation error: ${errorText}`);
            }
        } else if (response.status === 403) {
            throw Error("Permission denied. Ensure you authorized the GitHub app to create comments on this repository.");
        } else {
            throw Error(`Failed to ${operationName || "perform operation"} (${response.status}): ${errorText}`);
        }
    }
}

export async function createGithubPRComment(
    token: string | null,
    owner: string,
    repo: string,
    prNumber: string,
    body: string,
    path: string,
    line: number,
    side: "LEFT" | "RIGHT" = "RIGHT",
    startLine?: number,
    startSide?: "LEFT" | "RIGHT",
): Promise<GithubPRComment> {
    const prInfo = await fetchGithubPRInfo(token, owner, repo, prNumber);

    const requestBody: {
        body: string;
        commit_id: string;
        path: string;
        line: number;
        side: "LEFT" | "RIGHT";
        start_line?: number;
        start_side?: "LEFT" | "RIGHT";
    } = {
        body,
        commit_id: prInfo.head.sha,
        path,
        line,
        side,
    };

    // Add multiline comment parameters if provided
    if (startLine !== undefined && startSide !== undefined) {
        requestBody.start_line = startLine;
        requestBody.start_side = startSide;
    }

    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/${prNumber}/comments`, "POST", {
        body: requestBody,
        requireAuth: true,
        operationName: "create PR comment",
    });
}

export async function replyToGithubPRComment(
    token: string | null,
    owner: string,
    repo: string,
    prNumber: string,
    commentId: number,
    body: string,
): Promise<GithubPRComment> {
    const requestBody = {
        body,
        in_reply_to: commentId,
    };

    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/${prNumber}/comments`, "POST", {
        body: requestBody,
        requireAuth: true,
        operationName: "reply to PR comment",
    });
}

export async function updateGithubPRComment(token: string | null, owner: string, repo: string, commentId: number, body: string): Promise<GithubPRComment> {
    const requestBody = {
        body,
    };

    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/comments/${commentId}`, "PATCH", {
        body: requestBody,
        requireAuth: true,
        operationName: "update PR comment",
    });
}

export async function deleteGithubPRComment(token: string | null, owner: string, repo: string, commentId: number): Promise<void> {
    return await makeGithubRequest(token, `/repos/${owner}/${repo}/pulls/comments/${commentId}`, "DELETE", {
        requireAuth: true,
        operationName: "delete PR comment",
    });
}

export async function fetchGithubPRWithComments(
    token: string | null,
    owner: string,
    repo: string,
    prNumber: string,
): Promise<{
    diffResult: GithubDiffResult;
    comments: GithubPRComment[];
}> {
    const [diffResult, comments] = await Promise.all([
        fetchGithubPRComparison(token, owner, repo, prNumber),
        fetchGithubPRComments(token, owner, repo, prNumber),
    ]);

    return { diffResult, comments };
}
