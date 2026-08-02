# Chessroll

> Turn chess positions into short-form stories.

Chessroll is a deterministic TypeScript/Node CLI that turns PGN games and FEN positions into polished 1080×1920 vertical videos, in the spirit of chess Shorts/Reels — but rendered from real Stockfish analysis and real chess rules, not screen-recorded from a website.

```text
PGN / FEN → chess model → Stockfish analysis → story → scene timeline → renderAtTime(t) → MP4
```

**Status: all six templates working end-to-end — `puzzle`, `blunder`, `brilliant`, `replay`, `game60`, and `guess`.** This is not yet the full product described in [`ROADMAP.md`](./ROADMAP.md)/[`BLUEPRINT.md`](./BLUEPRINT.md); see [Roadmap](#roadmap) below for exactly what's built versus planned.

## Demo

See these live at [alessandrobessi.github.io/chessroll](https://alessandrobessi.github.io/chessroll/), or the canonical demo videos are committed under [`demo/`](./demo) right here — click a poster to play the MP4 (all rendered with `--coordinates`, which is off by default):

| Puzzle                                                                                                                                                          | Blunder                                                                                                                                                     | Brilliant                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Puzzle demo — find the move, mate in 2](demo/puzzle/poster.png)](demo/puzzle/demo.mp4)                                                                       | [![Blunder demo — spot the mistake](demo/blunder/poster.png)](demo/blunder/demo.mp4)                                                                        | [![Brilliant demo — a forced-mate queen sacrifice](demo/brilliant/poster.png)](demo/brilliant/demo.mp4)                                               |
| [`demo/puzzle/position.fen`](demo/puzzle/position.fen) — a mate-in-2 rook "staircase": find the move, countdown, oxblood reveal, forced continuation to `Rh8#`. | [`demo/blunder/game.pgn`](demo/blunder/game.pgn) — an original short game where `15...Nxe4??` opens the diagonal to a hanging queen, punished by `16.Bxd8`. | [`demo/brilliant/game.pgn`](demo/brilliant/game.pgn) — a constructed smothered-mate position: `1.Qg8+!!` sacrifices the queen, forcing `Rxg8 2.Nf7#`. |

| Replay                                                                                                                                                             | Game60                                                                                                                                                                                               | Guess the Move                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Replay demo — a full game with a real blunder](demo/replay/poster.png)](demo/replay/demo.mp4)                                                                   | [![Game60 demo — a compressed game with a real blunder](demo/game60/poster.png)](demo/game60/demo.mp4)                                                                                               | [![Guess demo — an honest engine comparison](demo/guess/poster.png)](demo/guess/demo.mp4)                                                                      |
| [`demo/replay/game.pgn`](demo/replay/game.pgn) — a 32-ply original game, importance-weighted throughout, pausing on the real, engine-verified blunder `14.Qxb6??`. | [`demo/game60/game.pgn`](demo/game60/game.pgn) — a 70-ply original game (rendered here with `--target 25` to make the compression visible), pausing on the real, engine-verified blunder `18.Bg6??`. | [`demo/guess/game.pgn`](demo/guess/game.pgn) — a 26-ply original game; auto-detects White's 7.e5 and honestly reports that Stockfish actually preferred 7.Nc3. |

Regenerate any of these locally:

```bash
pnpm install && pnpm build
node dist/cli.js demo/puzzle/position.fen --template puzzle -o demo/puzzle/demo.mp4 --show-eval --coordinates
node dist/cli.js demo/blunder/game.pgn --template blunder -o demo/blunder/demo.mp4 --show-eval --coordinates
node dist/cli.js demo/brilliant/game.pgn --template brilliant -o demo/brilliant/demo.mp4 --show-eval --coordinates
node dist/cli.js demo/replay/game.pgn --template replay -o demo/replay/demo.mp4 --show-eval --coordinates
node dist/cli.js demo/game60/game.pgn --template game60 -o demo/game60/demo.mp4 --show-eval --coordinates --target 25
node dist/cli.js demo/guess/game.pgn --template guess -o demo/guess/demo.mp4 --show-eval --coordinates
```

## What Chessroll does

Given a chess position or game, Chessroll:

1. Normalizes the input through [chess.js](https://github.com/jhlywa/chess.js) — never hand-rolls chess legality.
2. Analyzes the relevant position(s) with a real Stockfish process over UCI, caching results on disk.
3. Selects/builds a **story**: a specific narrative for the chosen template (a puzzle's solve/reveal, a blunder's swing/punishment).
4. Compiles the story into a **scene timeline**: a sequence of segments, each a pure, static description of what's on screen.
5. Renders every frame with a single deterministic function of time, `renderAtTime(t)`, inside a headless Chromium page.
6. Encodes the PNG sequence to an H.264 MP4 with FFmpeg.

Every step is inspectable independently — see [Debugging](#debugging).

## Templates

| Template    | Input | Status  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `puzzle`    | FEN   | ✅ done | Position → prompt → countdown → oxblood reveal → best move → forced continuation → payoff.                                                                                                                                                                                                                                                                                                                                                                                |
| `blunder`   | PGN   | ✅ done | Auto-detects (or `--move` forces) the game's most severe mistake → hook → quick lead-in → the blunder move plays (unflagged) → freeze → "spot the mistake?" → countdown → reveal (highlighted + evaluation swing) → engine's actual punishment → payoff.                                                                                                                                                                                                                  |
| `replay`    | PGN   | ✅ done | Full game replay, importance-weighted per move (quiet 0.35s → capture 0.50s → check 0.60s → large eval swing 0.90s+pause → critical move 1.20s+pause+`!!`/`??` annotation). Persistent player/rating/event/year header, running move number, optional evaluation, the game's actual result at the end.                                                                                                                                                                    |
| `game60`    | PGN   | ✅ done | Full game bounded to a target duration (`--target`, default 60s — a target, not a hard cap). Same move-classification/header/result logic as `replay`, but budget-scaled: every move's duration is proportionally compressed to fit, uniformly capped so a short game is never artificially padded out. Only critical moments pause; replay's "swing" pause is dropped to keep pacing tight.                                                                              |
| `guess`     | PGN   | ✅ done | Auto-detects (or `--move` forces) the game's most decisive moment — no severity threshold, any real decision is a fair prompt → hook → lead-in → freeze → "you are [player]" → "what do you play?" → countdown → reveal → the actual move animates → an honest engine comparison ("matches Stockfish's top choice" or "Stockfish preferred X instead" — never claims the move was objectively best unless the engine agrees) → the real game's own continuation → payoff. |
| `brilliant` | PGN   | ✅ done | Auto-detects (or `--move` forces) the game's standout move — a near-unique best move or a material sacrifice that still wins — → hook → lead-in → freeze → "X to move?" → countdown → oxblood reveal → the move animates → forced continuation proving the point → payoff (`!`/`!!` annotation).                                                                                                                                                                          |

## Quick start

```bash
pnpm install                # also runs `playwright install chromium` (postinstall)
pnpm build                  # bundles src/{cli,debug-cli}.ts -> dist/, renderer/ -> renderer/dist/
node dist/cli.js test/fixtures/puzzle.fen --template puzzle -o puzzle.mp4
```

Prefer a bare `chessroll` command instead of `node dist/cli.js`? `package.json` already declares it as a `bin` entry — `pnpm link --global` (after `pnpm build`) makes both `chessroll` and `chessroll-debug` available anywhere on your `PATH` (run `pnpm setup` first if pnpm reports no global bin directory).

### FEN example (`puzzle`)

```bash
node dist/cli.js --fen "6k1/8/8/8/8/8/R7/K6R w - - 0 1" --template puzzle -o mate-in-2.mp4 --show-eval
```

### PGN example (`blunder`)

```bash
node dist/cli.js test/fixtures/blunder-game.pgn --template blunder -o blunder.mp4 --show-eval
# Force a specific ply instead of auto-detecting (1-based ply index):
node dist/cli.js test/fixtures/blunder-game.pgn --template blunder --move 16 -o forced.mp4
```

### PGN example (`brilliant`)

```bash
node dist/cli.js test/fixtures/brilliant-game.pgn --template brilliant -o brilliant.mp4 --show-eval --multipv 2
# Force a specific ply instead of auto-detecting (1-based ply index):
node dist/cli.js test/fixtures/brilliant-game.pgn --template brilliant --move 1 -o forced.mp4
```

`brilliant` needs `--multipv 2` or higher to measure the gap to the engine's runner-up alternative (the CLI raises this automatically to 2 when the template is `brilliant`, even if `--multipv` is left unset).

### PGN example (`replay`)

```bash
node dist/cli.js test/fixtures/replay-game.pgn --template replay -o replay.mp4 --show-eval --coordinates
```

`replay` renders the whole game — there's no `--move` (nothing to feature) or `--countdown` (no countdown phase); total duration is emergent from each move's importance rather than a fixed budget.

### PGN example (`game60`)

```bash
node dist/cli.js test/fixtures/game60-game.pgn --template game60 -o game60.mp4 --show-eval --coordinates --target 45
```

`game60` shares `replay`'s move classification and header/result logic, but bounds total duration to `--target` seconds (default 60 — a target, not a hard cap) by uniformly scaling every move's duration down to fit, never padding a short game out artificially. Only critical moments pause; `replay`'s "large swing" pause is dropped to keep pacing tighter.

### PGN example (`guess`)

```bash
node dist/cli.js test/fixtures/guess-game.pgn --template guess -o guess.mp4 --show-eval --coordinates
# Force a specific ply instead of auto-detecting (1-based ply index):
node dist/cli.js test/fixtures/guess-game.pgn --template guess --move 13 -o forced.mp4
```

`guess` has no minimum-severity threshold for auto-detection (unlike `blunder`/`brilliant`) — every ply is a fair "what would you have played?" prompt, so it always picks the single largest-magnitude moment in the game rather than ever failing to find a "qualifying" one.

## Installation

Requirements:

- Node.js 22+
- [pnpm](https://pnpm.io/)
- [Stockfish](https://stockfishchess.org/) on `PATH`, or pass `--engine <path>` per invocation
- FFmpeg/ffprobe on `PATH`

```bash
pnpm install
```

`postinstall` runs `playwright install chromium` automatically.

## Stockfish setup

```bash
# macOS
brew install stockfish
# Debian/Ubuntu
apt install stockfish
```

Chessroll discovers `stockfish` on `PATH` by default; override per run with `--engine /path/to/stockfish`. Analysis settings (`--depth`/`--nodes`, `--threads`, `--hash`, `--multipv`) are explicit and cached on disk, keyed by FEN + engine version + those settings — upgrading Stockfish invalidates stale cache entries automatically. See `src/engine/{uci,stockfish,cache,normalize}.ts`.

## CLI

```text
chessroll <input> [options]

Input:
  <input>                 .fen file (puzzle) or .pgn file (blunder, brilliant, replay, game60, guess)
  --fen <fen>              inline FEN, instead of an input file (puzzle only)

Options:
  -o, --output <path>      output MP4 path (default: <input basename>.mp4)
  --template <name>        "puzzle" (default, needs FEN), "blunder"/"brilliant"/"replay"/"game60"/"guess" (need PGN)
  --move <n>                1-based ply to force as the featured move (blunder/brilliant/guess only)
  --orientation <side>      white | black | auto
  --fps <n>                  frames per second (default 30)
  --width <px>               output width (default 1080)
  --height <px>              output height (default 1920)
  --engine <path>            path to the Stockfish binary
  --depth <n>                 search depth (default 18)
  --nodes <n>                 search node limit (mutually exclusive with --depth)
  --threads <n>                engine threads (default 1)
  --hash <mb>                   engine hash size in MB (default 128)
  --multipv <n>                  engine MultiPV (default 1; brilliant auto-raises to >= 2)
  --countdown <seconds>          puzzle/blunder/brilliant/guess solve countdown (default 5; not used by replay/game60)
  --target <seconds>              game60's target duration (default 60 — a target, not a hard cap)
  --show-eval / --no-eval         reveal the evaluation (number + a left-of-board bar) (default hidden)
  --coordinates / --no-coordinates external file/rank labels outside the board (default hidden)
  --sound / --no-sound              synthesized move/capture/check/checkmate/countdown/reveal cues (default on)
  --keep-temp                      keep the temporary frame directory
  --no-cache                        bypass the analysis cache
  --verbose / --quiet
  --version / -h, --help
```

Exit codes are stable once published (`src/utils/errors.ts`): `1` unexpected failure, `2` invalid CLI arguments, `3` missing input, `4` invalid PGN/FEN, `5` missing dependency (Stockfish/FFmpeg/Chromium), `6` engine analysis failure, `7` story construction failure, `8` rendering failure, `9` encoding failure, `10` output/filesystem failure.

`chessroll-debug` is a separate binary for inspecting a scene without rendering a full video — see [Debugging](#debugging).

## Engine analysis

Stockfish is driven directly over UCI (`src/engine/uci.ts` — spawn → `uci`/`uciok` → `setoption` → `isready`/`readyok` → `position`/`go`/`info`/`bestmove`). Raw scores are always relative to the side to move; `src/engine/normalize.ts` is the single place they get flipped to White's perspective, and it's the only place mate scores get formatted (`M3`/`-M2`) — they are never coerced into a fake centipawn value anywhere else in the codebase. `normalize.ts` also exports `moverComparableValue`, one internal mate-aware _ranking_ scale (a mate always outranks any realistic cp swing) shared by both `blunder`'s and `brilliant`'s detectors purely to compare candidate severity; that value is never surfaced as a display string. `brilliant` compares the played move's resulting value against the engine's own top line rather than a literal UCI move-string match, since two genuinely tied best moves can make the engine's reported `bestmove` non-deterministic across runs.

## Sound design

Every cue (`move`, `capture`, `check`, `checkmate`, `countdown-tick`, `reveal`) is synthesized procedurally with FFmpeg's own `lavfi` audio sources (`sine`/`aevalsrc`) at render time — nothing is ever sourced from anywhere, sidestepping BLUEPRINT.md §28's "sound files must be original or legally redistributable" requirement entirely, and keeping generation deterministic (`src/audio/sounds.ts` has the exact frequencies/durations/gains). Each story builder (`src/story/{puzzle,blunder,brilliant}.ts`) records timestamped cues alongside the scene it's already constructing — landing-synced (`cueForPly`, off the same `Ply.flags` chess.js already computes) for move/capture/check/checkmate, onset-synced for countdown-ticks and the reveal moment. `src/video/ffmpeg.ts` mixes every cue into a single audio bed pinned to the exact video duration (`buildAudioFilterGraph`/`composeAudioBed`) and muxes it in as AAC. On by default; `--no-sound` produces a byte-for-byte identical video-only path.

## Deterministic rendering

Every frame is a pure function of its timestamp:

```ts
const t = n / fps;
const state = stateAtTime(timeline, t); // src/scene/state.ts — no wall clock, no prior-frame dependency
```

A `SceneTimeline` is a list of segments, each holding a static `SceneDescriptor`. Move-animation progress is derived from `t` against a `MoveAnimation`'s own `start`/`end`, using a fixed easing function (`src/scene/interpolation.ts`) — never a CSS transition. `renderer/renderer.css` is asserted, in a unit test, to contain no `transition`/`animation`/`@keyframes` rule at all.

## Visual identity

```text
Background   #F6F3EC   warm off-white
Primary      #171717   near-black
Accent       #6B1F2A   oxblood — last move, reveals, arrows, evaluation
Secondary    #6B6B68
```

The board squares/overlays use Chessroll's own tokens above. Pieces are [lichess.org](https://lichess.org)'s default **cburnett** set by Colin M.L. Burnett — vendored unmodified at `renderer/assets/pieces/cburnett/` and embedded in `src/board/pieces.ts` — used under its GPLv2+ license (see [Licensing](#licensing)). Board square colors and typography (currently a system font stack) are flagged in `src/board/theme.ts` as defaults still pending visual sign-off — nothing here is final art direction.

## Architecture

```mermaid
flowchart TD
    A[PGN / FEN] --> B["chess.js normalization<br/>(src/chess)"]
    B --> C["Stockfish UCI analysis<br/>(src/engine)"]
    C --> D["Story construction<br/>(src/story: puzzle.ts, blunder.ts, brilliant.ts, replay.ts, game60.ts, guess.ts)"]
    D --> E["SceneTimeline<br/>(src/scene)"]
    E --> F["Board/overlay markup<br/>(src/board/render.ts)"]
    F --> G["Chromium page<br/>renderAtTime(t) per frame<br/>(renderer/ + src/video)"]
    G --> H["PNG sequence → FFmpeg<br/>(src/video/ffmpeg.ts)"]
    H --> I[MP4]
```

`src/scene/**` and `src/board/**` are the shared pure core: bundled into _both_ the Node CLI and the browser (`renderer/renderer.ts`), enforced by a dedicated `tsconfig.renderer.json` project and an ESLint rule banning `node:*` imports there.

Full source layout:

```text
src/
  cli.ts, debug-cli.ts, index.ts   entrypoints + renderVideo() orchestrator
  chess/     PGN/FEN loading, normalized Ply/ChessGame model
  engine/    Stockfish UCI, normalization, disk cache, analyzeGame()
  story/     puzzle.ts, blunder.ts, brilliant.ts, replay.ts, game60.ts, guess.ts, shared.ts — chess+analysis -> SceneTimeline
  scene/     pure timeline types, interpolation, stateAtTime()
  board/     geometry, theme, cburnett piece set, moves, arrows, render.ts
  audio/     cue types (move/capture/check/checkmate/countdown-tick/reveal), synthesis params
  video/     Playwright capture, ffmpeg encode (incl. audio-bed synthesis+mux), ffprobe validation
  config/    CLI-flag resolution and defaults
  utils/     exit-code errors, temp dirs, executable discovery
renderer/    the Chromium-loaded page (index.html, renderer.ts, renderer.css)
test/        unit/ (no external processes) · integration/ (real Stockfish/Chromium) · e2e/ (full pipeline gates)
```

## Debugging

`chessroll-debug` inspects any stage without rendering a full video:

```bash
node dist/debug-cli.js test/fixtures/puzzle.fen --dump-game game.json
node dist/debug-cli.js test/fixtures/puzzle.fen --analyze --depth 12 --output analysis.json
node dist/debug-cli.js test/fixtures/puzzle.fen --story puzzle --output story.json
node dist/debug-cli.js test/fixtures/puzzle.fen --template puzzle --time 7.5 --output frame.png
```

`--dump-game` accepts both `.fen` and `.pgn` input; `--analyze`/`--story`/`--time` are currently scoped to FEN/puzzle (a `.pgn` input for those returns a clear error, not a silent misbehavior).

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm format
pnpm test:unit          # pure logic, no external processes
pnpm test:integration   # real Stockfish / real Chromium via Playwright
pnpm test:e2e           # full-pipeline acceptance gates (puzzle, blunder, brilliant, replay, game60, guess)
pnpm test               # everything — 256 tests as of this writing
```

Chess-correctness fixtures (`test/fixtures/`) — castling both directions, en passant, promotion/underpromotion, checkmate, stalemate, and the puzzle/blunder/brilliant/replay/game60/guess demo positions — are each verified programmatically against chess.js (and, for the demo fixtures, against the real Stockfish binary) rather than hand-derived. This caught a real bug during development: chess.js's own `isCapture()` excludes en passant, which would have produced an incorrect `Ply.flags.capture`.

## GitHub Pages

[**alessandrobessi.github.io/chessroll**](https://alessandrobessi.github.io/chessroll/) — a static showcase page (`site/`) in the same visual identity as the rendered videos: all five templates' demos with source FEN/PGN shown alongside each, how-it-works, CLI quick start, and a static architecture pipeline diagram (no JS framework, no CDN — plain HTML/CSS, `<video preload="none" poster controls>` for click-to-play without eager-loading five MP4s).

Deployed by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`, via the official minimal-permissions (`contents: read`, `pages: write`, `id-token: write`) Actions deployment flow. It packages the site against the demo assets **already committed to the repo** — it never re-renders anything, so it needs no Stockfish/FFmpeg/Chromium. Re-rendering-and-validating the canonical demos in CI is `demo.yml`'s job, still on the roadmap.

Regenerate the site locally: `pnpm build` (part of the same build as the CLI/renderer) writes a fully self-contained `site/dist/` — open `site/dist/index.html` directly.

## Roadmap

Done (this repository, current state):

- Normalized chess model (FEN + PGN), verified special-move fixtures
- Deterministic SVG board/overlay renderer, lichess's cburnett piece set
- Stockfish UCI integration, score normalization, disk cache
- `puzzle`, `blunder`, `brilliant`, `replay`, `game60`, and `guess` templates, full CLI + debug CLI
- External board coordinates (`--coordinates`), off by default
- An evaluation bar left of the board and player name/rating headers (`replay`/`game60`), whenever `evaluation` is shown
- Playwright capture → FFmpeg encode pipeline
- Synthesized sound design (`src/audio/`) — move/capture/check/checkmate/countdown-tick/reveal cues, muxed in as AAC, on by default (`--no-sound` to mute)
- Canonical demo assets for all six working templates (`demo/puzzle/`, `demo/blunder/`, `demo/brilliant/`, `demo/replay/`, `demo/game60/`, `demo/guess/`)
- A GitHub Pages showcase site (`site/`), deployed by `pages.yml`
- 256 tests across unit/integration/e2e, including six full-pipeline acceptance gates

Not yet built — see [`ROADMAP.md`](./ROADMAP.md) and [`BLUEPRINT.md`](./BLUEPRINT.md) for the full spec:

- `auto` template — explicitly out of scope, dropped by product decision
- The rest of CI (`ci.yml` for lint/test/build, `demo.yml` to re-render and validate the canonical demos automatically)
- Visual-regression testing and a finalized visual pass (current board square colors are placeholders, see [Visual identity](#visual-identity))

## Licensing

Chessroll's own code is [MIT](./LICENSE), with one asset exception:

| Files                                                                                                                   | Author                                                            | License                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `renderer/assets/pieces/cburnett/*.svg` (vendored unmodified) and the equivalent inline markup in `src/board/pieces.ts` | [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett) | [GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt) |

This is lichess.org's own default piece set (`public/piece/cburnett` in [lichess-org/lila](https://github.com/lichess-org/lila), see their [COPYING.md](https://github.com/lichess-org/lila/blob/master/COPYING.md)), used here by explicit choice to render immediately recognizable pieces rather than a bespoke set. If you redistribute or modify these specific SVG files, GPLv2+ terms apply to them — see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

Famous games' moves/metadata may be used where legally appropriate, but copyrighted annotations, commentary, or proprietary puzzle explanations are never copied — the `blunder` demo fixture, for instance, is an original short game, not a real recorded game.

## Contributing

This is an early-stage personal project without a formal contribution process yet. Read [`AGENTS.md`](./AGENTS.md) for the non-negotiable engineering constraints (determinism, chess correctness, engine-score normalization, visual identity) before proposing changes — issues and PRs are welcome once the repository is public.
