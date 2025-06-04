import type { RequestHandler } from "@sveltejs/kit";
import { PUBLIC_GITHUB_CLIENT_ID } from "$env/static/public";
import { GITHUB_CLIENT_SECRET } from "$env/static/private";

export const POST: RequestHandler = async ({ url }) => {
    const code = url.searchParams.get("code");
    if (!code) {
        return new Response("Missing code parameter", { status: 400 });
    }
    const state = url.searchParams.get("state");
    const body = {
        client_id: PUBLIC_GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        state,
    };
    const headers = new Headers({
        "Content-Type": "application/json",
        Accept: "application/json",
    });
    const githubResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const text = await githubResponse.text();
    return new Response(text, {
        status: githubResponse.status,
        headers: {
            "Content-Type": "application/json",
        },
    });
};
