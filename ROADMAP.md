# Chessroll — Roadmap

> Turn PGN and FEN into beautiful, analysis-driven vertical chess videos.

## 1. Product vision

Build a deterministic CLI/content engine that converts chess games and positions into polished 1080×1920 videos for YouTube Shorts.

The product is not merely a PGN replay renderer. Its long-term value is:

```text
PGN / FEN
    ↓
chess model
    ↓
Stockfish analysis
    ↓
interesting-moment detection
    ↓
story/template selection
    ↓
deterministic vertical renderer
    ↓
MP4
```

The engine should support several content formats from the same underlying analysis/timeline.

Working project name: **Chessroll**.

Tagline:

> Turn chess positions into short-form stories.

Before public release, perform a final package/trademark/domain check.

## 2. Visual identity

Use the same family identity as Notaroll:

```text
Background     #F6F3EC  warm off-white
Primary        #171717  near-black
Accent         #6B1F2A  oxblood
Secondary      #6B6B68
```

Style:

- modern;
- minimal;
- calm;
- premium;
- high contrast;
- typography-led;
- no imitation of Chess.com/Lichess visual identity;
- no unnecessary gradients, shadows, textures, or gaming effects.

Oxblood is used for:

- last move;
- active move;
- arrows;
- critical squares;
- countdown/progress;
- tactical reveal;
- evaluation emphasis.

## 3. Primary inputs

### PGN

```bash
chessroll game.pgn
```

PGN is used for:

- full games;
- miniatures;
- guess-the-move;
- blunder detection;
- brilliant-move stories;
- opening traps.

### FEN

```bash
chessroll --fen "..."
```

or:

```bash
chessroll position.fen
```

FEN is used for:

- puzzles;
- mate-in-N;
- endgames;
- find-the-move;
- tactical positions.

## 4. Core content templates

### `replay`

A polished game replay.

```bash
chessroll game.pgn --template replay
```

### `game60`

Compress a game into a Short. Quiet moves run quickly; critical positions slow down.

```bash
chessroll game.pgn --template game60
```

### `puzzle`

Show a position, prompt the viewer, countdown, then reveal the solution.

```bash
chessroll position.fen --template puzzle
```

### `guess`

Pause before a selected grandmaster move.

```bash
chessroll game.pgn --template guess --move 23
```

### `blunder`

Find or select a large evaluation swing, freeze before it, then reveal the mistake and punishment.

```bash
chessroll game.pgn --template blunder
```

### `brilliant`

Center the video around a unique tactical/strategic move.

```bash
chessroll game.pgn --template brilliant
```

### `endgame`

Present a win/draw challenge from FEN.

### `opening`

Animate a short opening trap or instructive sequence.

### `auto`

Analyze the source, select the strongest story, and choose a template automatically.

```bash
chessroll game.pgn --auto
```

`auto` is a later milestone. Do not block v0.1 on automatic storytelling.

## 5. v0.1 scope

Implement first:

1. `puzzle`
2. `blunder`
3. `replay`

Then:

4. `game60`
5. `guess`
6. `brilliant`

The first flagship format is **Find the Move**.

## 6. Proposed stack

```text
TypeScript
Node.js 22+
pnpm
chess.js                  PGN/FEN/legal chess state
Stockfish                 engine analysis
custom SVG/HTML board     deterministic visual control
Playwright + Chromium     frame rendering
FFmpeg + ffprobe          encoding/validation
```

Prefer a custom SVG board or a permissively licensed board renderer whose appearance can be fully controlled.

Do not screen-record a chess website.

## 7. Core architecture

```text
PGN/FEN
   ↓
Parser
   ↓
ChessTimeline
   ├───────────────┐
   ↓               ↓
Board states     Stockfish
   │               │
   └──────┬────────┘
          ↓
     Analysis model
          ↓
     Story/template
          ↓
     Scene timeline
          ↓
 renderAtTime(t)
          ↓
      Chromium
          ↓
       FFmpeg
          ↓
        MP4
```

Audio is optional in v0.1. The renderer should support adding subtle move/capture/check sounds later, but the visual story must work without voice-over.

## 8. Deterministic scene model

Every frame is a function of timestamp.

```ts
renderAtTime(t: number)
```

The scene model should describe:

```text
board position
piece animation progress
last move
arrows
highlighted squares
evaluation
title/prompt
countdown
move notation
player metadata
story phase
```

Never use wall-clock animation as the source of truth.

## 9. Chess data model

Create a normalized model:

```ts
interface ChessGame {
  metadata: GameMetadata;
  initialFen: string;
  plies: Ply[];
}

interface Ply {
  index: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  side: "white" | "black";
}

interface Analysis {
  ply: number;
  evaluation: number | null;
  mate: number | null;
  bestMove: string;
  pv: string[];
  multipv?: CandidateLine[];
}
```

Keep raw Stockfish output outside rendering code.

## 10. Stockfish analysis

Support configurable:

```text
depth
nodes
threads
hash
MultiPV
```

For repeatable content generation, prefer fixed depth/nodes rather than arbitrary real-time analysis duration.

Cache analysis keyed by:

```text
position
Stockfish version
analysis settings
```

Do not re-analyze identical positions unnecessarily.

## 11. Interesting-moment detection

Later versions should detect:

### Blunder

Large evaluation swing after a move.

### Only move

Best move is substantially better than alternatives.

### Tactical shot

Large evaluation gain with forcing PV characteristics.

### Mate

Forced mate appears/disappears.

### Turning point

Evaluation crosses a meaningful threshold.

### Critical defense

Only move avoids a losing evaluation.

The detection layer proposes moments; template logic decides whether they make a compelling Short.

## 12. Puzzle format timeline

Canonical flow:

```text
0.0–1.5    title / position appears
1.5–3.0    "White to move"
3.0–8.0    solve countdown
8.0–9.0    reveal arrow / highlight
9.0–12.0   animate best move
12.0–18.0  animate forcing continuation
18.0–21.0  final position + concise payoff
```

Durations should be configurable.

The board should remain the dominant visual object.

## 13. Blunder format timeline

Example:

```text
hook
↓
quick lead-in moves
↓
freeze before blunder
↓
"Can you spot the mistake?"
↓
countdown
↓
blunder animation
↓
evaluation swing
↓
best punishment
↓
final tactical idea
```

Avoid dumping engine variations on screen.

## 14. Replay/game60 timing

Do not allocate equal time to every move.

Use importance-weighted timing.

Quiet opening moves:

```text
fast
```

Critical move:

```text
slow → pause → reveal
```

Possible timing inputs:

- evaluation change;
- capture;
- check;
- mate threat;
- phase of game;
- annotation;
- manual emphasis.

## 15. Board rendering

Render the board as vector graphics.

Requirements:

- crisp at 1080×1920;
- no raster scaling artifacts;
- coordinates optional;
- orientation configurable;
- smooth piece movement;
- capture animation;
- promotion;
- castling;
- en passant;
- check indication;
- last-move squares;
- arrows;
- tactical square highlights.

Do not redraw the whole board through a canvas bitmap if SVG can provide stable vector output.

## 16. Piece set

Use a clean, modern, legally redistributable piece set.

The pieces should be recognizable immediately on a phone.

Do not make them overly abstract.

Keep board and piece assets replaceable through a theme abstraction, but ship only one polished default theme in v0.1.

## 17. Vertical composition

Default layout:

```text
┌──────────────────────────┐
│       STORY / TITLE      │
│                          │
│    ┌────────────────┐    │
│    │                │    │
│    │     BOARD      │    │
│    │                │    │
│    └────────────────┘    │
│                          │
│      White to move       │
│                          │
│       COUNTDOWN          │
│                          │
│       +2.4 / M3          │
│                          │
│       move / payoff      │
└──────────────────────────┘
```

The exact composition changes by template, but the board stays visually dominant.

## 18. Evaluation display

Do not copy the standard chess-site vertical evaluation bar by default.

Use a minimal bespoke representation, for example:

```text
WHITE  +3.2  ━━━━━━━━━●━━  BLACK
```

or a restrained vertical treatment integrated into the layout.

Mate should display as:

```text
M3
```

rather than an arbitrary centipawn value.

Evaluation can be hidden during puzzle solving and revealed afterward.

## 19. Move animation

A move should be deterministic:

```text
piece starts at source
↓
interpolate
↓
piece arrives at destination
↓
capture resolves
↓
board settles
```

Use easing, but calculate easing from normalized timestamp.

Do not rely on CSS transition completion events.

## 20. Arrows and explanations

Support vector arrows:

```text
from square
to square
style
opacity
label optional
```

Use oxblood for the main tactical idea.

Future explanation layer may generate concepts such as:

- removes defender;
- opens file;
- forks king and queen;
- pins;
- overloads;
- mating net;
- discovered attack.

Do not make v0.1 dependent on automatically generating natural-language chess explanations.

## 21. CLI

Executable:

```bash
chessroll
```

Primary usage:

```bash
chessroll <input.pgn> [options]
chessroll <input.fen> [options]
```

Core options:

```text
-o, --output <path>
--template <name>
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
--countdown <seconds>
--show-eval
--no-eval
--coordinates
--no-coordinates
--keep-temp
--verbose
--quiet
--version
-h, --help
```

Defaults:

```text
1080×1920
30 fps
orientation auto
Stockfish discovered from PATH/config
```

## 22. Debug CLI

Provide:

```bash
chessroll-debug game.pgn --analyze
chessroll-debug game.pgn --dump-analysis analysis.json
chessroll-debug position.fen --time 7.5 --output frame.png
chessroll-debug game.pgn --story story.json
```

Debugging a scene must not require rendering a complete video.

## 23. Audio

v0.1 may use subtle optional sound design:

- move;
- capture;
- check;
- countdown;
- reveal.

Avoid noisy game-like sound effects.

Keep the Short usable muted.

Future versions may add:

- generated narration;
- user-supplied narration;
- music beds.

Do not make narration necessary for comprehension.

## 24. Canonical demo content

Create several original/legal fixtures:

```text
demo/
├── puzzle/
│   ├── position.fen
│   └── demo.mp4
├── blunder/
│   ├── game.pgn
│   └── demo.mp4
└── replay/
    ├── game.pgn
    └── demo.mp4
```

For famous historical games, verify the underlying game-score data can be used and avoid copying copyrighted annotations/commentary.

## 25. Rich README

README structure:

```text
Chessroll
tagline
demo
what it does
content templates
quick start
PGN example
FEN example
output examples
installation
Stockfish setup
CLI
automatic analysis
architecture
rendering model
visual identity
debugging
testing
GitHub Pages
roadmap
licensing
contributing
```

Show the puzzle demo near the top.

Use Mermaid for architecture.

## 26. GitHub Pages

Build a modern/minimal static site using the same identity.

Hero:

```text
CHESSROLL

Turn chess positions
into short-form stories.

[Watch demos] [View on GitHub]
```

Show:

1. Find the Move
2. Spot the Blunder
3. Game in 60 Seconds

For each, show source PGN/FEN beside the resulting video.

## 27. CI/CD

Create:

```text
.github/workflows/
├── ci.yml
├── demo.yml
└── pages.yml
```

### CI

On PR/push:

```text
pnpm install --frozen-lockfile
lint
format check
typecheck
unit tests
integration tests
build CLI
build site
```

### Demo

Install Stockfish + FFmpeg + Chromium, render canonical fixtures, validate with ffprobe, upload artifacts.

Cache Stockfish analysis where practical.

### Pages

Deploy only validated demo assets.

Use minimal permissions.

## 28. Tests

Unit:

- PGN/FEN loading;
- move parsing;
- evaluation normalization;
- story timing;
- animation interpolation;
- template selection;
- CLI.

Integration:

- Stockfish UCI;
- board SVG;
- analysis cache;
- scene generation.

E2E:

```text
FEN → puzzle MP4
PGN → blunder MP4
PGN → replay MP4
```

Visual regression:

- board;
- highlight;
- arrow;
- countdown;
- evaluation;
- move transition;
- capture;
- check.

## 29. v0.1 implementation sequence

```text
01 repository skeleton
02 PGN/FEN loader
03 normalized chess timeline
04 SVG board renderer
05 deterministic renderAtTime(t)
06 piece move animation
07 FFmpeg frame/video pipeline
08 Stockfish UCI integration
09 deterministic analysis cache
10 puzzle scene model
11 puzzle countdown/reveal
12 oxblood arrows/highlights
13 puzzle end-to-end video
14 blunder detection
15 blunder template
16 replay template
17 debug commands
18 E2E + ffprobe
19 canonical demos
20 rich README
21 GitHub Pages
22 CI/demo/pages workflows
23 visual quality pass
24 v0.1.0
```

## 30. Future: automatic storytelling

The eventual differentiator is:

```bash
chessroll game.pgn --auto
```

Pipeline:

```text
analyze all positions
↓
rank candidate moments
↓
classify story type
↓
select hook
↓
select relevant lead-in
↓
select forcing continuation
↓
construct scene timeline
↓
render
```

Potential output:

```text
"This move loses instantly."
"Only one move wins."
"Can you find Kasparov's idea?"
"Black has one defense."
"White sacrificed a rook. Why?"
```

Keep generated claims grounded in engine analysis and chess state.

## 31. Definition of done

v0.1 is complete when:

```bash
chessroll demo/puzzle/position.fen --template puzzle
chessroll demo/blunder/game.pgn --template blunder
chessroll demo/replay/game.pgn --template replay
```

all generate validated 1080×1920 MP4s and human review confirms:

- modern/minimal identity;
- board readable on phone;
- smooth deterministic piece motion;
- oxblood highlights/arrows;
- clear puzzle interaction;
- accurate Stockfish analysis;
- no visual jitter;
- strong muted viewing experience;
- rich README;
- polished GitHub Pages;
- green CI.
