import { browser } from "$app/environment";
import { PUBLIC_GITHUB_APP_NAME, PUBLIC_GITHUB_CLIENT_ID } from "$env/static/public";

export const GITHUB_USERNAME_KEY = "github_username";
export const GITHUB_TOKEN_KEY = "github_token";
export const GITHUB_TOKEN_EXPIRES_KEY = "github_token_expires";

export const githubUsername: { value: string | null } = $state({ value: null });

if (browser) {
    githubUsername.value = localStorage.getItem(GITHUB_USERNAME_KEY);
}

export interface GithubTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
}

export function getGithubUsername(): string | null {
    return githubUsername.value;
}

export function getGithubAvatarUrl(username: string, size: number = 32): string | null {
    return `https://avatars.githubusercontent.com/${username}?s=${size}`;
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
