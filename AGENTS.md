# AGENTS.md --- Chessroll Coding Agent Instructions

## Mission

Build **Chessroll**, a TypeScript/Node engine and CLI that turns PGN/FEN
chess content into modern, deterministic 1080×1920 short-form videos.

Read `ROADMAP.md` before implementation.

## Product principle

Chessroll is not a screen recorder and not merely a PGN viewer.

The architecture is:

``` text
PGN/FEN
   ↓
normalized chess model
   ↓
Stockfish analysis
   ↓
story/template
   ↓
deterministic scene timeline
   ↓
renderAtTime(t)
   ↓
frames
   ↓
FFmpeg
```

## Non-negotiables

-   TypeScript.
-   Node.js 22+.
-   pnpm.
-   chess.js or an equivalent focused chess-state library.
-   Stockfish through UCI.
-   SVG/HTML visual rendering.
-   Playwright/Chromium.
-   FFmpeg/ffprobe.
-   1080×1920 default output.
-   30 fps default.
-   modern/minimal design.
-   background `#F6F3EC`.
-   primary `#171717`.
-   accent `#6B1F2A`.
-   deterministic frame rendering.
-   no screen recording.
-   no dependency on a chess website.
-   no copied site visual identity.

## Source-of-truth priority

1.  current explicit user request;
2.  `ROADMAP.md`;
3.  README;
4.  implementation convenience.

## Timing

Frame `n`:

``` ts
const t = n / fps;
```

Scene state must be derivable directly from `t`.

Never make frame N depend on having rendered frame N-1.

Do not use CSS transition completion as timeline state.

## Chess correctness

Never hand-roll chess legality when a tested chess library can provide
it.

Stockfish evaluation must be associated with the correct side-to-move
convention and normalized consistently.

Mate scores must not be treated as ordinary centipawn values.

Test:

-   castling;
-   en passant;
-   promotion;
-   check;
-   checkmate;
-   stalemate;
-   repetition-related PGN parsing where relevant.

## Engine analysis

Use UCI cleanly.

Make analysis settings explicit.

Prefer deterministic depth/node constraints over arbitrary time limits
for generated content.

Cache analysis.

Store engine version/settings with cached results.

Do not make natural-language tactical claims unsupported by the
position/analysis.

## Visual design

Chessroll and Notaroll belong to the same visual family.

Default tokens:

``` text
#F6F3EC
#171717
#6B1F2A
#6B6B68
```

The board is the hero.

Use oxblood for active/reveal information.

Avoid:

-   neon;
-   gradients;
-   fake wood;
-   excessive shadows;
-   gaming HUD clutter;
-   bouncing pieces;
-   copied Chess.com/Lichess evaluation UI.

## Board

Prefer vector assets.

Pieces must remain immediately recognizable at phone size.

Piece animation must support all legal move types.

Do not mutate board geometry during animation.

## Templates

Implement in this order:

1.  puzzle;
2.  blunder;
3.  replay;
4.  game60;
5.  guess;
6.  brilliant;
7.  auto.

Do not implement `auto` before the foundational templates are reliable.

## Puzzle behavior

A puzzle should work with audio muted.

Required story:

``` text
position
prompt
thinking time
reveal
best move
continuation
payoff
```

Hide engine evaluation during solving by default.

Do not reveal the answer through premature highlighting.

## Blunder behavior

Do not simply choose the numerically largest evaluation change without
sanity checks.

Confirm:

-   position is meaningful;
-   engine result is stable enough;
-   punishment is understandable;
-   the selected lead-in is short enough for a Short.

## Storytelling

Prefer one idea per video.

Do not dump full principal variations.

Do not fill the screen with engine numbers.

Use engine analysis to construct a story, not to display an analysis
console.

## CLI

Keep user-facing behavior synchronized with ROADMAP.

Errors must be concise and actionable.

Maintain stable exit codes once published.

## Debug tools

Preserve ways to inspect:

-   parsed game;
-   engine analysis;
-   story model;
-   scene timeline;
-   arbitrary rendered timestamp.

Do not force full MP4 rendering for debugging.

## Testing

Every bug involving chess state, timing, engine normalization, or
rendering should get a regression test when practical.

Use small fixtures.

Use ffprobe for final media assertions.

Maintain visual regression images for critical scene states.

## Famous games

Game moves and factual metadata may be used where legally appropriate,
but do not copy copyrighted annotations, prose, commentary, video
scripts, or proprietary puzzle explanations.

Prefer original text and engine-derived analysis.

## README

README is part of the product.

Keep:

-   quick start;
-   templates;
-   Stockfish setup;
-   CLI;
-   architecture;
-   demos;
-   troubleshooting;

current whenever behavior changes.

## GitHub Pages

The site should showcase actual validated Chessroll outputs.

Do not fake videos with mock animations once the real renderer exists.

## CI

PR CI must be safe for untrusted code.

Deployment jobs receive only required permissions.

Do not publish failed or unvalidated demo renders.

## Scope

Do not add:

-   accounts;
-   cloud backend;
-   database;
-   social-network publishing;
-   voice synthesis;
-   LLM explanations;
-   web editor;

unless explicitly requested.

## Definition of done

A feature is done when:

-   it works;
-   typecheck/lint pass;
-   tests pass;
-   output is visually reviewed when relevant;
-   documentation is updated;
-   no debug hacks remain.

Quality and clarity outrank feature count.
