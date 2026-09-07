import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
    plugins: [tailwindcss(), sveltekit()],
    // Bundle the server-side deps into the SSR output so the adapter-cloudflare
    // artifact is self-contained (it ships no node_modules).
    ssr: { noExternal: ["@sveltejs/kit", "diff", "shiki"] },
    // Tell Vitest to use the `browser` entry points in `package.json` files, even though it's running in Node
    resolve: process.env.VITEST
        ? {
              conditions: ["browser"],
          }
        : undefined,
}));
