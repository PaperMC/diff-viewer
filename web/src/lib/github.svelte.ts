import { browser } from "$app/environment";
import type { components } from "@octokit/openapi-types";
import { splitMultiFilePatch, trimCommitHash } from "$lib/util";
import { makeImageDetails } from "$lib/diff-viewer-multi-file.svelte";
import { PUBLIC_GITHUB_APP_NAME, PUBLIC_GITHUB_CLIENT_ID } from "$env/static/public";

export const GITHUB_USERNAME_KEY = "github_username";
export const GITHUB_TOKEN_KEY = "github_token";
export const GITHUB_TOKEN_EXPIRES_KEY = "github_token_expires";
export const GITHUB_URL_PARAM = "github_url";

export const githubUsername: { value: string | null } = $state({ value: null });

export type GithubDiff = {
    owner: string;
    repo: string;
    base: string;
    head: string;
    description: string;
    backlink: string;
};

export type GithubDiffResult = {
    info: GithubDiff;
    response: string;
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

export async function fetchGithubPRComparison(token: string | null, owner: string, repo: string, prNumber: string): Promise<GithubDiffResult> {
    const prInfo = await fetchGithubPRInfo(token, owner, repo, prNumber);
    const base = prInfo.base.sha;
    const head = prInfo.head.sha;
    const title = `${prInfo.title} (#${prInfo.number})`;
    return await fetchGithubComparison(token, owner, repo, base, head, title, prInfo.html_url);
}

function injectOptionalToken(token: string | null, opts: RequestInit) {
    if (token) {
        opts.headers = {
            ...opts.headers,
            Authorization: `Bearer ${token}`,
        };
    }
}

export async function fetchGithubPRInfo(token: string | null, owner: string, repo: string, prNumber: string): Promise<GithubPR> {
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

export function splitMultiFilePatchGithub(details: GithubDiff, patch: string) {
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
    const opts: RequestInit = {
        headers: {
            Accept: "application/vnd.github.v3.diff",
        },
    };
    injectOptionalToken(token, opts);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`, opts);
    if (response.ok) {
        if (!description) {
            description = `Comparing ${trimCommitHash(base)}...${trimCommitHash(head)}`;
        }
        if (!url) {
            url = `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
        }
        const info = { owner, repo, base, head, description, backlink: url };
        return { response: await response.text(), info };
    } else {
        throw Error(`Failed to retrieve comparison (${response.status}): ${await response.text()}`);
    }
}

export async function fetchGithubCommitDiff(token: string | null, owner: string, repo: string, commit: string): Promise<GithubDiffResult> {
    const diffOpts: RequestInit = {
        headers: {
            Accept: "application/vnd.github.v3.diff",
        },
    };
    injectOptionalToken(token, diffOpts);
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commit}`;
    const response = await fetch(url, diffOpts);
    if (response.ok) {
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
        const info = { owner, repo, base: firstParent, head: commit, description, backlink: meta.html_url };
        return {
            response: await response.text(),
            info,
        };
    } else {
        throw Error(`Failed to retrieve commit diff (${response.status}): ${await response.text()}`);
    }
}

export async function fetchGithubFile(token: string | null, owner: string, repo: string, path: string, ref: string): Promise<Blob> {
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
