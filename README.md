# [Diff Viewer](https://diffs.dev)
Featureful and performant web-based diff viewer.

- `web`: SvelteKit app using Tailwind CSS, deployed to Cloudflare Pages via GitHub Actions.
- `web-extension`: Browser extension that streamlines opening diffs in the viewer
  ([Firefox](https://addons.mozilla.org/en-US/firefox/addon/patch-roulette/),
  [Chrome](https://chromewebstore.google.com/detail/patch-roulette/feaaoepdocmiibjilhoahgldkaajfnhb)).

## Development

Requires Node 24+ and [pnpm](https://pnpm.io/). Run `pnpm install` in the repo root, then from `web`:

- `pnpm run dev`: start the dev server
- `pnpm run test`: run unit tests
- `pnpm run check`: type check
- `pnpm run lint` / `pnpm run format`: check / apply ESLint and Prettier

[![CI powered by namespace badge](https://papermc.io/assets/misc/namespace-oss-badge.svg?project=diff-viewer)](https://namespace.so/github-actions/?utm_source=oss&utm_campaign=papermc)
