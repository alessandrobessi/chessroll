# Chessroll --- Implementation Blueprint

> Turn chess positions into short-form stories.

This document is the execution specification for building **Chessroll**
from an empty repository. `ROADMAP.md` defines product direction; this
file defines architecture, interfaces, implementation order, acceptance
gates, and deliverables.

------------------------------------------------------------------------

## 0. Product target

Build a TypeScript/Node CLI that accepts PGN or FEN and generates
polished, deterministic 1080×1920 MP4 videos for YouTube Shorts.

Primary contracts:

``` bash
chessroll game.pgn --template replay
chessroll game.pgn --template blunder
chessroll position.fen --template puzzle
```

Long-term:

``` bash
chessroll game.pgn --auto
```

The engine should analyze chess content, identify meaningful moments,
construct a scene timeline, and render a short-form chess story.

The first flagship format is **Find the Move**.

------------------------------------------------------------------------

## 1. Non-negotiable requirements

-   TypeScript.
-   Node.js 22+.
-   pnpm.
-   PGN and FEN input.
-   chess.js for chess state/legality unless a clearly superior focused
    dependency is justified.
-   Stockfish through UCI.
-   deterministic timestamp-driven rendering;
-   Playwright + Chromium;
-   FFmpeg + ffprobe;
-   vector-first board/pieces/overlays;
-   1080×1920 default output;
-   30 fps default;
-   modern/minimal visual identity;
-   warm off-white `#F6F3EC`;
-   near-black `#171717`;
-   oxblood `#6B1F2A`;
-   usable with audio muted;
-   no screen recording;
-   no dependency on chess websites;
-   no copied Chess.com/Lichess visual identity.

Correct chess state, engine interpretation, storytelling clarity, and
visual quality outrank rendering speed.

------------------------------------------------------------------------

## 2. Repository layout

``` text
chessroll/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── demo.yml
│       └── pages.yml
├── demo/
│   ├── puzzle/
│   │   ├── position.fen
│   │   ├── demo.mp4
│   │   └── poster.png
│   ├── blunder/
│   │   ├── game.pgn
│   │   ├── demo.mp4
│   │   └── poster.png
│   └── replay/
│       ├── game.pgn
│       ├── demo.mp4
│       └── poster.png
├── renderer/
│   ├── index.html
│   ├── renderer.ts
│   └── renderer.css
├── site/
│   ├── index.html
│   ├── styles.css
│   ├── main.ts
│   └── assets/
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── chess/
│   │   ├── pgn.ts
│   │   ├── fen.ts
│   │   ├── game.ts
│   │   └── types.ts
│   ├── engine/
│   │   ├── stockfish.ts
│   │   ├── uci.ts
│   │   ├── analysis.ts
│   │   ├── normalize.ts
│   │   └── cache.ts
│   ├── story/
│   │   ├── types.ts
│   │   ├── puzzle.ts
│   │   ├── blunder.ts
│   │   ├── replay.ts
│   │   ├── game60.ts
│   │   ├── guess.ts
│   │   ├── brilliant.ts
│   │   └── auto.ts
│   ├── scene/
│   │   ├── types.ts
│   │   ├── timeline.ts
│   │   ├── state.ts
│   │   └── interpolation.ts
│   ├── board/
│   │   ├── geometry.ts
│   │   ├── pieces.ts
│   │   ├── moves.ts
│   │   ├── arrows.ts
│   │   └── theme.ts
│   ├── video/
│   │   ├── browser.ts
│   │   ├── frames.ts
│   │   ├── ffmpeg.ts
│   │   └── probe.ts
│   ├── audio/
│   │   ├── timeline.ts
│   │   └── sounds.ts
│   ├── config/
│   │   ├── defaults.ts
│   │   └── load.ts
│   └── utils/
│       ├── errors.ts
│       ├── paths.ts
│       ├── process.ts
│       └── temp.ts
├── test/
│   ├── fixtures/
│   │   ├── simple.pgn
│   │   ├── castle.pgn
│   │   ├── promotion.pgn
│   │   ├── en-passant.pgn
│   │   ├── mate.fen
│   │   └── puzzle.fen
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── README.md
├── ROADMAP.md
├── BLUEPRINT.md
├── AGENTS.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Keep chess state, engine analysis, story construction, scene timing,
rendering, and encoding separate.

------------------------------------------------------------------------

## 3. Core chess model

Normalize PGN/FEN immediately.

``` ts
interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: number;
  blackElo?: number;
}

interface ChessGame {
  metadata: GameMetadata;
  initialFen: string;
  plies: Ply[];
}

interface Ply {
  index: number;
  moveNumber: number;
  side: "white" | "black";
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  flags: {
    capture: boolean;
    check: boolean;
    mate: boolean;
    castle: boolean;
    enPassant: boolean;
    promotion: boolean;
  };
}
```

Do not make renderer code parse SAN/PGN.

------------------------------------------------------------------------

## 4. Stockfish model

Raw UCI output must be normalized before story code sees it.

``` ts
interface EngineScore {
  type: "cp" | "mate";
  value: number;
  perspective: "white";
}

interface CandidateLine {
  rank: number;
  score: EngineScore;
  moves: string[];
}

interface PositionAnalysis {
  fen: string;
  engineVersion: string;
  depth?: number;
  nodes?: number;
  bestMove: string;
  score: EngineScore;
  pv: string[];
  multipv: CandidateLine[];
}
```

Normalize all centipawn evaluations to White's perspective.

Do not convert mate scores into fake centipawn values.

------------------------------------------------------------------------

## 5. Stockfish UCI integration

Implement a robust child-process wrapper.

Required UCI lifecycle:

``` text
spawn
uci
uciok
setoption...
isready
readyok
position fen ...
go depth N / go nodes N
info ...
bestmove ...
```

Support:

``` text
--engine
--depth
--nodes
--threads
--hash
```

Prefer fixed depth or node limits for reproducibility.

Handle:

-   process startup failure;
-   unsupported executable;
-   malformed output;
-   premature process exit;
-   timeout;
-   missing `bestmove`.

------------------------------------------------------------------------

## 6. Analysis cache

Cache by a stable key derived from:

``` text
FEN
Stockfish version
depth/nodes
MultiPV
threads/hash only if they materially affect expected result contract
```

Store JSON under a cache directory outside source-controlled output.

Allow:

``` bash
--no-cache
```

for debugging.

Never make CI depend on a developer's local cache.

------------------------------------------------------------------------

## 7. Scene architecture

The renderer consumes a `SceneTimeline`, not chess/engine objects
directly.

``` ts
interface SceneTimeline {
  duration: number;
  segments: SceneSegment[];
}

interface SceneSegment {
  start: number;
  end: number;
  state: SceneDescriptor;
}

interface SceneDescriptor {
  position: BoardPosition;
  moveAnimation?: MoveAnimation;
  title?: TextElement;
  subtitle?: TextElement;
  prompt?: TextElement;
  evaluation?: EvaluationElement;
  arrows?: ArrowElement[];
  highlights?: HighlightElement[];
  countdown?: CountdownElement;
  moveLabel?: TextElement;
  playerInfo?: PlayerInfoElement;
}
```

Template code transforms chess + analysis into scenes.

Renderer code does not decide the story.

------------------------------------------------------------------------

## 8. Deterministic rendering

Every visual state must be recoverable directly:

``` ts
stateAtTime(t: number): RenderState
```

For frame `n`:

``` ts
const t = n / fps;
```

Never depend on:

-   wall clock;
-   `setTimeout`;
-   CSS transition completion;
-   prior frame state;
-   real-time engine analysis.

Use deterministic easing functions:

``` ts
easeInOutCubic(progress)
```

where `progress` is computed from `t`.

------------------------------------------------------------------------

## 9. Board geometry

Use a square vector board centered in the portrait composition.

Board geometry:

``` ts
interface BoardGeometry {
  x: number;
  y: number;
  size: number;
  squareSize: number;
  orientation: "white" | "black";
}
```

All overlays derive from this geometry.

Implement:

``` ts
squareToPoint("e4")
squareToRect("e4")
```

for both orientations.

Do not duplicate coordinate math in arrows, highlights, and pieces.

------------------------------------------------------------------------

## 10. Board theme

Initial design tokens:

``` text
page background     #F6F3EC
primary text        #171717
secondary text      #6B6B68
accent              #6B1F2A
```

Board-square colors should harmonize with these tokens but remain
sufficiently distinct.

Choose exact light/dark square values through visual testing.

Requirements:

-   premium/minimal;
-   immediately legible;
-   not visually derivative of major chess sites;
-   works under H.264 compression;
-   good contrast for black/white pieces;
-   oxblood overlays remain visible.

------------------------------------------------------------------------

## 11. Piece set

Use a legally redistributable vector piece set.

Before committing assets:

-   verify license;
-   preserve attribution;
-   document source;
-   test at phone scale.

Piece renderer should expose:

``` ts
renderPiece(piece, square, transform)
```

Keep assets replaceable.

------------------------------------------------------------------------

## 12. Move animation

Represent moves explicitly.

``` ts
interface MoveAnimation {
  from: string;
  to: string;
  piece: Piece;
  capturedPiece?: Piece;
  start: number;
  end: number;
  promotion?: PieceType;
  secondaryMove?: {
    from: string;
    to: string;
    piece: Piece;
  };
}
```

During animation:

1.  source square becomes empty;
2.  moving piece interpolates;
3.  captured piece handling is deterministic;
4.  destination resolves;
5.  promotion resolves;
6.  castling rook moves in synchronization.

Support en passant correctly.

------------------------------------------------------------------------

## 13. Overlay primitives

Build reusable vector primitives:

``` text
SquareHighlight
Arrow
Circle
MoveLabel
Evaluation
Countdown
Prompt
PlayerCard
Progress
```

Arrows:

``` ts
interface ArrowElement {
  from: string;
  to: string;
  color: string;
  opacity: number;
  width: number;
}
```

Main tactical arrows default to oxblood.

Avoid clutter.

------------------------------------------------------------------------

## 14. Evaluation representation

Normalize display:

``` text
cp +34  → +0.3
cp -417 → -4.2
mate +3 → M3
mate -2 → -M2
```

Hide evaluation during the solving phase of a puzzle by default.

Reveal evaluation only when it strengthens the payoff.

Do not use a copied chess-site evaluation bar.

------------------------------------------------------------------------

## 15. Puzzle template

Input:

``` text
FEN
optional manually supplied solution
otherwise Stockfish analysis
```

Default scene structure:

``` text
INTRO
SOLVE
REVEAL
MOVE
CONTINUATION
PAYOFF
```

Suggested timing:

``` text
0.0–1.0    board enters
1.0–2.5    prompt
2.5–7.5    solve
7.5–8.5    reveal
8.5–10.0   best move
10.0–16.0  continuation
16.0–19.0  payoff
```

Configurable countdown:

``` bash
--countdown 5
```

Prompt:

``` text
WHITE TO MOVE
FIND THE BEST MOVE
```

Do not show arrows/engine score before reveal.

------------------------------------------------------------------------

## 16. First vertical slice

Start with one simple FEN puzzle.

Pipeline:

``` text
FEN
 ↓
chess.js validation
 ↓
Stockfish
 ↓
best move + PV
 ↓
PuzzleStory
 ↓
SceneTimeline
 ↓
SVG board
 ↓
renderAtTime(t)
 ↓
PNG frames
 ↓
FFmpeg
 ↓
puzzle.mp4
```

Acceptance gate:

``` bash
chessroll test/fixtures/puzzle.fen --template puzzle
```

produces a valid 1080×1920 MP4.

Do not implement blunder/replay before this works.

------------------------------------------------------------------------

## 17. Blunder detection

For each played move compare evaluation before and after.

Define normalized mover loss carefully.

Conceptually:

``` ts
loss = evaluationForMover(before) - evaluationForMover(after)
```

Candidate thresholds should be configurable.

Do not rely on one threshold alone.

Reject or downgrade candidates where:

-   evaluation is already completely lost;
-   the engine score is unstable;
-   punishment is extremely obscure/long;
-   position is trivial;
-   move occurs after practical game conclusion.

Use MultiPV to identify whether a natural alternative existed.

------------------------------------------------------------------------

## 18. Blunder story

Construct:

``` text
hook
lead-in
freeze before move
question
countdown
blunder
evaluation swing
punishment
payoff
```

Keep lead-in short.

Example text:

``` text
ONE MOVE THROWS IT AWAY
CAN YOU SPOT THE MISTAKE?
```

Avoid automatically calling every engine inaccuracy a "blunder."

------------------------------------------------------------------------

## 19. Replay template

Input PGN.

Render:

-   player names;
-   optional ratings/event;
-   move number;
-   board;
-   last move;
-   optional evaluation;
-   result.

Move duration should be importance-weighted.

Start with a simple heuristic:

``` text
quiet move       0.35 s
capture          0.50 s
check            0.60 s
large eval swing 0.90 s + pause
critical move    1.20 s + annotation
```

Then tune.

------------------------------------------------------------------------

## 20. Game60

Target a bounded duration, initially approximately 60 seconds.

Calculate a move-time budget.

Reserve time for:

-   intro;
-   critical pauses;
-   result/outro.

Compress low-information sequences.

Do not make every move too fast merely to satisfy exactly 60.000
seconds. Allow a sensible configurable target window.

------------------------------------------------------------------------

## 21. Guess-the-move

Input PGN + selected move or auto-selected critical move.

Flow:

``` text
lead-in
freeze
"You are [player]"
"What do you play?"
countdown
actual move
engine comparison
continuation
```

Do not imply the historical move was objectively best unless Stockfish
analysis supports that claim.

------------------------------------------------------------------------

## 22. Brilliant-move candidate logic

Do not copy proprietary "brilliant move" classifications.

Create Chessroll's own transparent criteria.

Possible candidate characteristics:

-   unique or near-unique best move;
-   tactical sacrifice;
-   best move materially exceeds alternatives;
-   position improves/wins;
-   forcing continuation is short enough to show.

Name the template `brilliant`, but documentation should explain that it
means a Chessroll-selected standout move, not another platform's
classification.

------------------------------------------------------------------------

## 23. Future `--auto`

Do not implement until manual templates work.

Candidate pipeline:

``` text
analyze
 ↓
extract moments
 ↓
features
 ↓
rank
 ↓
classify
 ↓
story suitability
 ↓
template
```

Candidate features:

``` text
eval swing
mate appearance
only-move gap
sacrifice
check
capture
promotion
game phase
PV length
material imbalance
historical move vs best move
```

Output a machine-readable decision report under `--verbose`/debug mode.

------------------------------------------------------------------------

## 24. CLI contract

``` text
Usage:
  chessroll <input> [options]

Input:
  .pgn or .fen

Options:
  -o, --output <path>
  --template <puzzle|blunder|replay|game60|guess|brilliant>
  --auto
  --orientation <white|black|auto>
  --move <number>
  --fps <30|60>
  --width <px>
  --height <px>
  --engine <path>
  --depth <n>
  --nodes <n>
  --threads <n>
  --hash <mb>
  --multipv <n>
  --countdown <seconds>
  --show-eval
  --no-eval
  --coordinates
  --no-coordinates
  --keep-temp
  --no-cache
  --verbose
  --quiet
  --version
  -h, --help
```

Default output:

``` text
game.pgn → game.mp4
position.fen → position.mp4
```

Reject ambiguous/unsupported combinations clearly.

------------------------------------------------------------------------

## 25. Exit codes

``` text
0 success
1 unexpected/internal failure
2 invalid CLI arguments
3 missing/unreadable input
4 invalid PGN/FEN
5 missing dependency
6 Stockfish analysis failure
7 story/template construction failure
8 visual rendering failure
9 video encoding failure
10 output/filesystem failure
```

Document them.

------------------------------------------------------------------------

## 26. Debug commands

Implement developer tooling equivalent to:

``` bash
chessroll-debug game.pgn --dump-game game.json
chessroll-debug game.pgn --analyze --output analysis.json
chessroll-debug game.pgn --story blunder --output story.json
chessroll-debug position.fen --template puzzle --time 6.2 --output frame.png
```

Debug output should make engine-perspective errors obvious.

------------------------------------------------------------------------

## 27. FFmpeg pipeline

Initial implementation may use PNG frames.

``` text
Chromium
 ↓
frame-%06d.png
 ↓
FFmpeg
 ↓
MP4
```

Final output:

``` text
1080×1920
30 fps default
H.264 High Profile
yuv420p
AAC if audio exists
```

Use high-quality CRF settings.

Later optimize by piping frames directly to FFmpeg.

------------------------------------------------------------------------

## 28. Optional sound design

Keep sound restrained.

Potential cues:

``` text
move
capture
check
countdown tick
reveal
```

No cue is required for understanding.

Sound files must be original or legally redistributable.

Avoid repetitive loud chess-clock/game sounds.

------------------------------------------------------------------------

## 29. Canonical demos

Create three showcase fixtures.

### Puzzle

Choose or create a position with:

-   one clear best move;
-   attractive tactical idea;
-   2--4 move forcing continuation;
-   visually understandable payoff.

### Blunder

Use an original/generated game fixture or legally usable historical
score with original Chessroll analysis.

### Replay

Use a short attractive game.

Do not copy third-party annotations.

------------------------------------------------------------------------

## 30. README specification

Hero:

``` text
CHESSROLL

Turn chess positions
into short-form stories.
```

Immediately show Find-the-Move demo.

Required sections:

1.  hero;
2.  demo;
3.  what Chessroll does;
4.  templates;
5.  quick start;
6.  FEN example;
7.  PGN example;
8.  installation;
9.  Stockfish setup;
10. CLI;
11. engine analysis;
12. deterministic rendering;
13. visual system;
14. architecture;
15. debugging;
16. testing;
17. GitHub Pages;
18. roadmap;
19. licensing;
20. contributing.

Include Mermaid architecture.

------------------------------------------------------------------------

## 31. GitHub Pages

Build under `site/`.

Reuse:

``` text
#F6F3EC
#171717
#6B1F2A
```

Homepage:

``` text
Hero
Find the Move demo
Spot the Blunder demo
Game Replay demo
How it works
Stockfish analysis
Deterministic rendering
CLI quick start
Architecture
GitHub CTA
```

Show source FEN/PGN near each output.

Keep the site static and lightweight.

------------------------------------------------------------------------

## 32. CI

### `ci.yml`

``` text
checkout
Node 22
pnpm
frozen install
lint
format
typecheck
unit tests
integration tests
build CLI
build site
```

Use a known Stockfish package/binary for integration tests.

### `demo.yml`

``` text
checkout
build
install Stockfish
install FFmpeg
install Playwright Chromium
render canonical demos
ffprobe validate
extract posters
upload artifacts
```

### `pages.yml`

Consume validated demos and deploy the static site.

Use official Pages deployment actions and minimal permissions.

------------------------------------------------------------------------

## 33. Automated media validation

For every demo/E2E output assert:

``` text
width = 1080
height = 1920
fps expected
video codec = h264
duration > 0
frame count plausible
audio optional according to template/config
```

Also verify output can be decoded by ffmpeg.

------------------------------------------------------------------------

## 34. Visual regression

Reference frames should cover:

``` text
initial board
solve prompt
countdown
reveal arrow
piece mid-animation
capture
check
evaluation reveal
blunder freeze
replay metadata
```

Review at actual phone-scale presentation.

------------------------------------------------------------------------

## 35. Chess regression fixtures

Explicitly test:

``` text
normal move
capture
check
mate
castle kingside
castle queenside
en passant
promotion
underpromotion
black orientation
PGN starting from custom FEN
```

Do not discover special-move bugs through demo rendering.

------------------------------------------------------------------------

## 36. Engine regression tests

Use stable tactical fixtures where expected best moves are well known
within the chosen Stockfish settings.

Do not assert exact centipawn equality across engine versions unless the
test pins the engine.

Prefer:

``` text
best move belongs to expected set
mate detected
score sign correct
PV legal
```

------------------------------------------------------------------------

## 37. Performance

Correctness first.

Then optimize:

1.  reuse Chromium page;
2.  avoid DOM reconstruction per frame;
3.  use SVG transforms;
4.  cache analysis;
5.  cache static scene elements;
6.  pipe frames to FFmpeg;
7.  parallelize independent game analysis carefully.

Never make deterministic output depend on machine rendering speed.

------------------------------------------------------------------------

## 38. Implementation sequence

``` text
01 repository/tooling
02 FEN loader
03 PGN loader
04 normalized chess model
05 board geometry
06 SVG board + pieces
07 arbitrary static frame
08 deterministic scene timeline
09 piece interpolation
10 PNG sequence
11 FFmpeg MP4
12 Stockfish UCI wrapper
13 analysis normalization
14 cache
15 puzzle story
16 countdown
17 reveal arrow/highlights
18 puzzle E2E
19 special-move rendering
20 blunder detector
21 blunder story
22 blunder E2E
23 replay story/timing
24 replay E2E
25 debug CLI
26 visual regressions
27 media validation
28 canonical demos
29 README
30 GitHub Pages
31 CI
32 demo workflow
33 Pages workflow
34 game60
35 guess
36 brilliant
37 quality pass
38 v0.1.0
```

------------------------------------------------------------------------

## 39. First acceptance gate

Before implementing Stockfish, prove deterministic visual rendering with
a hard-coded move:

``` text
FEN
 ↓
board
 ↓
e2 → e4 animation
 ↓
render frame at t=0.0
render frame at t=0.25
render frame at t=0.5
 ↓
MP4
```

This isolates the renderer.

Then add Stockfish.

------------------------------------------------------------------------

## 40. Second acceptance gate

Run:

``` bash
chessroll test/fixtures/puzzle.fen --template puzzle
```

Confirm:

-   valid position;
-   Stockfish finds expected move;
-   solve phase reveals nothing;
-   countdown works;
-   oxblood reveal appears at correct time;
-   move animation is smooth;
-   continuation is legal;
-   output validates with ffprobe.

Only then start blunder detection.

------------------------------------------------------------------------

## 41. Final v0.1 acceptance

From a clean documented environment:

``` bash
pnpm install
pnpm build

chessroll demo/puzzle/position.fen --template puzzle
chessroll demo/blunder/game.pgn --template blunder
chessroll demo/replay/game.pgn --template replay
```

Human review must confirm:

-   excellent phone readability;
-   modern/minimal visual identity;
-   smooth vector-derived board/pieces;
-   oxblood highlights/arrows;
-   accurate chess state;
-   accurate engine perspective;
-   compelling puzzle pacing;
-   understandable blunder story;
-   polished replay;
-   no animation jitter;
-   no copied third-party visual identity;
-   rich README;
-   working GitHub Pages;
-   green CI.

Only then tag `v0.1.0`.

------------------------------------------------------------------------

## 42. Guiding principle

The goal is not:

``` text
PGN → video
```

The goal is:

``` text
chess information
      ↓
understand what matters
      ↓
construct a tiny visual story
      ↓
render it beautifully
```

That distinction should guide every architectural decision.
