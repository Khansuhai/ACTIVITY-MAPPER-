# Contributing to OpenFlyover

Thanks for helping! Bug reports, ideas, test files and code are all welcome.

## Reporting a bug

Open an issue with the bug template. The most useful things to include:

- your browser and version, and your operating system
- what you did, what you expected, and what happened instead
- if an activity file misbehaves, the file itself (or a shortened copy). Remove anything private
  first, or use the privacy zone and export a GPX. Never post data you don't want public.

## Ground rules

- **Build it ourselves.** Don't copy code, designs, icons, text or assets from commercial apps,
  and don't decompile them. Reimplementing a _feature_ in our own way is fine.
- **Privacy first.** Activity files and photos are processed in the browser and never uploaded.
- **Respect data licences.** New map, terrain or imagery sources need their licence checked,
  attribution added to `src/basemaps/`, and a note in `docs/DECISIONS.md`.
- **Prefer MIT, BSD or Apache dependencies**, and don't add a library when a few lines will do.
  Check the licence of anything new and list it in the decisions log.
- **Never commit API keys.** Use `.env.local` (see `.env.example`).

## Development

```sh
pnpm install
pnpm dev
```

Before opening a pull request, run what CI runs:

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- TypeScript strict; keep pure logic (`src/track`, `src/camera`, `src/timeline`, `src/photos`)
  free of the DOM so it can be unit tested.
- Add tests for parsers, track maths, the timeline and anything else with logic.
- Preview and export must stay identical: draw through `timeline.at(t)` and `composeFrame()`.
- Explain notable technical choices in `docs/DECISIONS.md`.

## Commits and pull requests

- Small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `refactor:`, `perf:`).
- Describe what changed and how you tested it. Screenshots help for UI changes.
- Add a line to `CHANGELOG.md` under "Unreleased".

By contributing, you agree that your contribution is licensed under the MIT licence.
