import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        popup: "popup.html",
        options: "options.html",
        worker: "./src/worker.ts",
      },
      output: {
        format: "module",
        entryFileNames: "[name].js",
      },
    },
    terserOptions: {
      mangle: false,
    },
  },
  plugins: [tailwindcss()],
});
