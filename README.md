# Chessroll

> Turn chess positions into short-form stories.

This is a **core vertical slice**, not the full v0.1 described in `ROADMAP.md`/`BLUEPRINT.md`. It implements: the normalized chess model, the deterministic SVG board renderer, the FFmpeg video pipeline, Stockfish integration, and the `puzzle` template end-to-end. It satisfies both acceptance gates `BLUEPRINT.md` §39 and §40 (`test/e2e/gate39.test.ts`, `test/e2e/gate40.test.ts`).

Not yet built: the `blunder`/`replay`/`game60`/`guess`/`brilliant`/`auto` templates, the rich README, GitHub Pages, CI/demo/pages workflows, canonical demo assets, audio, and visual-regression tooling. See `ROADMAP.md`/`BLUEPRINT.md` for the full product spec and `AGENTS.md` for the engineering non-negotiables.

## Prerequisites

- Node.js 22+
- pnpm
- [Stockfish](https://stockfishchess.org/) on `PATH` (`brew install stockfish`), or pass `--engine <path>`
- FFmpeg/ffprobe on `PATH` (`brew install ffmpeg`)

## Quick start

```bash
pnpm install
pnpm build
node dist/cli.js test/fixtures/puzzle.fen --template puzzle -o puzzle.mp4
```

(`postinstall` also runs `playwright install chromium`.)

## Debugging

Inspect a scene without rendering a full video:

```bash
node dist/debug-cli.js test/fixtures/puzzle.fen --dump-game game.json
node dist/debug-cli.js test/fixtures/puzzle.fen --analyze --depth 12 --output analysis.json
node dist/debug-cli.js test/fixtures/puzzle.fen --story puzzle --output story.json
node dist/debug-cli.js test/fixtures/puzzle.fen --template puzzle --time 7.5 --output frame.png
```

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm format
pnpm test:unit          # pure logic, no external processes
pnpm test:integration   # real Stockfish / real Chromium via Playwright
pnpm test:e2e           # the two acceptance gates, full pipeline
pnpm test               # everything
```

## Architecture

```text
FEN
 ↓
chess.js validation (src/chess)
 ↓
Stockfish UCI analysis (src/engine)
 ↓
puzzle story timeline (src/story)
 ↓
SceneTimeline (src/scene) — stateAtTime(t) is a pure function, shared
 ↓                          between Node and the browser bundle
SVG board + overlay markup (src/board/render.ts)
 ↓
Chromium page, renderAtTime(t) per frame (src/video + renderer/)
 ↓
PNG sequence → FFmpeg (src/video/ffmpeg.ts)
 ↓
MP4
```

Design tokens, visual defaults (board colors, piece glyphs, typography), and open implementation decisions are documented inline where they're defined — see `src/board/theme.ts` and `src/board/pieces.ts`.
