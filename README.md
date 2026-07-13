# Mariano Regalado — Portfolio

Premium, recruiter-facing developer portfolio. Centerpiece is a pinned, scroll-scrubbed
hero that crossfades between three studio portraits (GSAP + ScrollTrigger).

Currently scaffolding only — see [`public/images/portraits/README.md`](public/images/portraits/README.md)
for what to drop in before the hero build starts.

## Stack

- [Vite](https://vitejs.dev/) — static build, no framework
- [GSAP](https://gsap.com/) + ScrollTrigger — pinned scroll-scrub hero
- Plain CSS with a design-tokens file (`src/styles/tokens.css`) — no CSS framework

## Requirements

- Node 20+
- [pnpm](https://pnpm.io/) — this project uses pnpm exclusively (not npm or yarn)

If you don't have pnpm yet: `corepack enable` (Node 16.13+ ships Corepack), or
`npm install -g pnpm`.

## Local development

```bash
pnpm install
pnpm dev
```

Opens the dev server (default `http://localhost:5173`) with hot reload.

## Build

```bash
pnpm build
```

Outputs a static site to `dist/`. Preview the production build locally with:

```bash
pnpm preview
```

## Deploying to GitHub Pages

This repo deploys to `https://marianor03.github.io/mariano-portfolio/` as a
project page. `vite.config.js` sets `base: '/mariano-portfolio/'` to match.

**Automatic (recommended):** `.github/workflows/deploy.yml` builds and deploys
on every push to `main` via GitHub Actions + the Pages API. One-time setup:

1. Push this repo to `marianor03/mariano-portfolio` on GitHub.
2. In the repo settings, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Push to `main` — the workflow builds with pnpm and deploys `dist/`.

**Manual alternative:** build locally and push `dist/` to a `gh-pages` branch
with a tool like [`gh-pages`](https://www.npmjs.com/package/gh-pages), or copy
`dist/` output into whatever static host you prefer. Not needed if using the
Actions workflow above.

## Project structure

```
├── public/
│   └── images/
│       └── portraits/        # the three studio portraits go here
├── src/
│   ├── main.js                # entry point, GSAP/ScrollTrigger setup
│   └── styles/
│       ├── tokens.css         # design tokens: color, type scale, spacing, motion
│       ├── base.css           # reset + element defaults
│       └── main.css           # layout + component styles
├── index.html                 # markup + section stubs
├── vite.config.js
└── .github/workflows/deploy.yml
```
