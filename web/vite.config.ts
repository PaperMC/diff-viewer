import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
    plugins: [tailwindcss(), sveltekit()],
    // Tell Vitest to use the `browser` entry points in `package.json` files, even though it's running in Node
    resolve: process.env.VITEST
        ? {
              conditions: ["browser"],
          }
        : undefined,
}));
