import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import { buildReplayStory } from "../../../src/story/replay.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

function pgnFromFen(fen: string, move: string): string {
  return `[SetUp "1"]\n[FEN "${fen}"]\n\n1. ${move} *`;
}

function analysis(fen: string, whitePerspectiveCp: number): PositionAnalysis {
  return {
    fen,
    engineVersion: "test",
    depth: 12,
    bestMove: "",
    score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
    pv: [],
    multipv: [],
  };
}

// GAME1: four quiet-looking moves (no captures/checks by themselves), used
// to isolate the quiet/swing/critical classification purely via fabricated
// eval deltas, independent of move type.
const GAME1 = loadPgn("1. e4 e5 2. Nf3 Nc6 *");
const FENS1 = [GAME1.initialFen, ...GAME1.plies.map((p) => p.fenAfter)];

// Real, chess.js-verified single-ply fixtures (same FENs already verified
// for src/audio/timeline.test.ts's cueForPly tests).
const CAPTURE_GAME = loadPgn(pgnFromFen("6k1/8/8/4b3/8/8/8/K3R3 w - - 0 1", "e1e5")); // Rxe5
const CHECK_GAME = loadPgn(pgnFromFen("6k1/8/8/8/8/8/8/4R1K1 w - - 0 1", "e1e8")); // Re8+
const MATE_GAME = loadPgn(pgnFromFen("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1", "e1e8")); // Re8#

describe("buildReplayStory: move classification and timing", () => {
  it("classifies quiet/swing/critical purely from the eval delta, with the right duration+pause+annotation", () => {
    const analyses = [
      analysis(FENS1[0]!, 0),
      analysis(FENS1[1]!, 10), // e4 (white): swing 10 -> quiet
      analysis(FENS1[2]!, -190), // e5 (black): swing 200 -> swing
      analysis(FENS1[3]!, 150), // Nf3 (white): swing 340 -> critical
      analysis(FENS1[4]!, 140), // Nc6 (black): swing 10 -> quiet
    ];
    const timeline = buildReplayStory(GAME1, analyses, { showEval: false });

    // INTRO 1.5 + e4(0.35) + e5(0.90+0.6 pause) + Nf3(1.20+1.0 pause) + Nc6(0.35) + OUTRO 3.0
    expect(timeline.duration).toBeCloseTo(8.9, 5);

    // e4: quiet, no pause segment (the very next segment is e5's own move).
    const e4 = stateAtTime(timeline, 1.6);
    expect(e4.moveLabel?.text).toBe("1. e4");
    expect(e4.highlights ?? []).toHaveLength(0);

    // e5: swing — a pause follows with no annotation and no highlight.
    const e5Pause = stateAtTime(timeline, 3.0);
    expect(e5Pause.moveLabel?.text).toBe("1... e5");
    expect(e5Pause.moveLabel?.emphasis).toBeFalsy();
    expect(e5Pause.highlights ?? []).toHaveLength(0);
    expect(e5Pause.moveAnimation).toBeUndefined();

    // Nf3: critical — pause has the "!!" annotation, emphasis, and highlights.
    const nf3Pause = stateAtTime(timeline, 5.0);
    expect(nf3Pause.moveLabel?.text).toBe("2. Nf3!!");
    expect(nf3Pause.moveLabel?.emphasis).toBe(true);
    expect(nf3Pause.highlights).toEqual([
      { square: "g1", style: "critical" },
      { square: "f3", style: "critical" },
    ]);
  });

  it("classifies a capturing, non-checking move as capture (0.50s, no pause)", () => {
    const fens = [CAPTURE_GAME.initialFen, CAPTURE_GAME.plies[0]!.fenAfter];
    const analyses = [analysis(fens[0]!, 20), analysis(fens[1]!, 30)]; // small swing
    const timeline = buildReplayStory(CAPTURE_GAME, analyses, { showEval: false });
    // INTRO 1.5 + capture 0.50 + OUTRO 3.0 (Result "*" -> no result title)
    expect(timeline.duration).toBeCloseTo(5.0, 5);
    const move = stateAtTime(timeline, 1.6);
    expect(move.moveLabel?.text).toBe("1. Rxe5");
  });

  it("classifies a checking, non-capturing move as check (0.60s, no pause)", () => {
    const fens = [CHECK_GAME.initialFen, CHECK_GAME.plies[0]!.fenAfter];
    const analyses = [analysis(fens[0]!, 20), analysis(fens[1]!, 25)]; // small swing
    const timeline = buildReplayStory(CHECK_GAME, analyses, { showEval: false });
    expect(timeline.duration).toBeCloseTo(5.1, 5);
    const move = stateAtTime(timeline, 1.6);
    expect(move.moveLabel?.text).toBe("1. Re8+");
  });

  it("treats a mate as critical regardless of the computed swing (even a small/negative one)", () => {
    const fens = [MATE_GAME.initialFen, MATE_GAME.plies[0]!.fenAfter];
    // Deliberately a tiny negative swing — without the mate override this
    // would fall through to "check" (Re8# is also a check), not "critical".
    const analyses = [analysis(fens[0]!, 50), analysis(fens[1]!, 40)];
    const timeline = buildReplayStory(MATE_GAME, analyses, { showEval: false });
    // INTRO 1.5 + critical 1.20 + pause 1.0 + OUTRO 3.0
    expect(timeline.duration).toBeCloseTo(6.7, 5);
    const pause = stateAtTime(timeline, 3.0);
    expect(pause.moveLabel?.text).toBe("1. Re8#??"); // swing (40-50=-10) < 0 -> "??"
    expect(pause.moveLabel?.emphasis).toBe(true);
  });
});

describe("buildReplayStory: header, event, and result", () => {
  it("falls back to White/Black with no event when the PGN carries no real headers", () => {
    // loadPgn defaults unset string headers to chess.js's own "?" placeholder.
    const analyses = [analysis(FENS1[0]!, 0), analysis(FENS1[1]!, 0)];
    const shortGame = loadPgn("1. e4 *");
    const timeline = buildReplayStory(shortGame, analyses.slice(0, 2), { showEval: false });
    const intro = stateAtTime(timeline, 0);
    expect(intro.title?.text).toBe("White vs Black");
    expect(intro.subtitle).toBeUndefined();
  });

  it("shows names with Elo (when present) and the event, persistently through the game", () => {
    const headeredGame = loadPgn(
      '[White "Carlsen"]\n[Black "Nepo"]\n[WhiteElo "2850"]\n[Event "World Championship"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    );
    const fens = [headeredGame.initialFen, ...headeredGame.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));
    const timeline = buildReplayStory(headeredGame, analyses, { showEval: false });

    // Carlsen has an Elo, Nepo doesn't — each formatted independently.
    for (const t of [0, 2.0]) {
      const state = stateAtTime(timeline, t);
      expect(state.title?.text).toBe("Carlsen (2850) vs Nepo");
      expect(state.subtitle?.text).toBe("World Championship");
    }
  });

  it("shows the recorded result at the outro, and switches away from the player header", () => {
    const headeredGame = loadPgn(
      '[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    );
    const fens = [headeredGame.initialFen, ...headeredGame.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));
    const timeline = buildReplayStory(headeredGame, analyses, { showEval: false });
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.title).toEqual({ text: "1-0", emphasis: true });
    expect(outro.moveLabel?.text).toBe("1... e5");
  });

  it("never invents a result when the PGN result is the unresolved '*' token", () => {
    const analyses = [analysis(FENS1[0]!, 0), analysis(FENS1[1]!, 0)];
    const shortGame = loadPgn("1. e4 *"); // metadata.result === "*"
    const timeline = buildReplayStory(shortGame, analyses.slice(0, 2), { showEval: false });
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.title).toBeUndefined();
  });
});

describe("buildReplayStory: audio cues", () => {
  it("lands a move cue at the end of each move segment, before any pause", () => {
    const analyses = [
      analysis(FENS1[0]!, 0),
      analysis(FENS1[1]!, 10),
      analysis(FENS1[2]!, -190),
      analysis(FENS1[3]!, 150),
      analysis(FENS1[4]!, 140),
    ];
    const timeline = buildReplayStory(GAME1, analyses, { showEval: false });
    // e4 (quiet, 0.35s) lands at INTRO end + 0.35.
    expect(timeline.audioCues).toContainEqual({ time: 1.85, type: "move" });
    // e5 (swing move itself has no capture/check) still just "move".
    expect(timeline.audioCues).toContainEqual({ time: 2.75, type: "move" });
  });
});
