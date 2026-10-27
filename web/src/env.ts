import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  PUBLIC_GITHUB_APP_NAME: { public: true, static: true },
  PUBLIC_GITHUB_CLIENT_ID: { public: true, static: true },
  GITHUB_CLIENT_SECRET: { static: true },
});
