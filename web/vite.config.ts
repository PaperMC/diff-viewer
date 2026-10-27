import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import cloudflareAdapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(() => ({
  plugins: [tailwindcss(), sveltekit({ preprocess: vitePreprocess(), adapter: cloudflareAdapter() })],
  ssr: { noExternal: ["@sveltejs/kit", "chroma-js", "diff", "shiki"] },
  // Tell Vitest to use the `browser` entry points in `package.json` files, even though it's running in Node
  resolve: process.env.VITEST
    ? {
        conditions: ["browser"],
      }
    : undefined,
}));
