# [Diff Viewer](https://diffs.dev)
Featureful and performant web-based diff viewer.

## Overview

### Routes

- [`/`](https://diffs.dev): Multi-file concise diff viewer

### Tech Stack

SvelteKit frontend using tailwindcss for styling, deployed to Cloudflare Pages via GitHub Actions.

### Web Extension

Web extension that streamlines opening diffs in the viewer.
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/patch-roulette/)
- [Chrome](https://chromewebstore.google.com/detail/patch-roulette/feaaoepdocmiibjilhoahgldkaajfnhb)

## Development

### Setup

- Install [pnpm](https://pnpm.io/) and execute `pnpm install` to install the required dependencies.
- Install a JVM 21 or newer for the Gradle runtime (prefer a JDK to avoid extra downloads for a compiler).

### Testing

- The frontend can be tested with `pnpm run dev` in `/web`.

### Code Style

- The frontend uses ESLint and Prettier for code style. Run `pnpm run format` to reformat and `pnpm run lint` to check style.
