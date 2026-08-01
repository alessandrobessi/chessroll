import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import {
  buildBrilliantStory,
  detectBrilliantMoves,
  selectBrilliantMove,
  type BrilliantCandidate,
} from "../../../src/story/brilliant.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";
import { StoryConstructionError } from "../../../src/utils/errors.js";

function pgnFromFen(fen: string, move: string): string {
  return `[SetUp "1"]\n[FEN "${fen}"]\n\n1. ${move} *`;
}

// Real, chess.js-verified sacrifice: Ba1-d4 lands on a square attacked by
// the c5 pawn, capturing nothing — a genuine (if artificial) sacrifice.
const SAC_GAME = loadPgn(pgnFromFen("6k1/8/8/2p5/8/8/8/B6K w - - 0 1", "Bd4"));
// Same idea, but Bc3 is NOT attacked afterward — not a sacrifice.
const NON_SAC_GAME = loadPgn(pgnFromFen("6k1/8/8/2p5/8/8/8/B6K w - - 0 1", "Bc3"));

function analysis(
  fen: string,
  whitePerspectiveCp: number,
  bestMove: string,
  multipv: PositionAnalysis["multipv"] = [],
): PositionAnalysis {
  return {
    fen,
    engineVersion: "test",
    depth: 12,
    bestMove,
    score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
    pv: [bestMove],
    multipv,
  };
}

function line(
  rank: number,
  whitePerspectiveCp: number,
  moves: string[],
): PositionAnalysis["multipv"][number] {
  return { rank, score: { type: "cp", value: whitePerspectiveCp, perspective: "white" }, moves };
}

describe("detectBrilliantMoves", () => {
  it("flags a move that is both a sacrifice and a near-unique best move", () => {
    const fens = [SAC_GAME.initialFen, SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "a1d4", [line(1, 20, ["a1d4"]), line(2, -150, ["h1g1"])]),
      analysis(fens[1]!, 300, "c5d4"),
    ];
    const candidates = detectBrilliantMoves(SAC_GAME, analyses);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.ply.san).toBe("Bd4");
    expect(candidates[0]!.isSacrifice).toBe(true);
  });

  it("flags a near-unique best move that is not a sacrifice", () => {
    const fens = [NON_SAC_GAME.initialFen, NON_SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "a1c3", [line(1, 20, ["a1c3"]), line(2, -150, ["h1g1"])]),
      analysis(fens[1]!, 300, "c5c4"),
    ];
    const candidates = detectBrilliantMoves(NON_SAC_GAME, analyses);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.isSacrifice).toBe(false);
  });

  it("rejects a move that isn't a sacrifice and has too small a gap to the runner-up", () => {
    const fens = [NON_SAC_GAME.initialFen, NON_SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "a1c3", [line(1, 20, ["a1c3"]), line(2, 10, ["h1g1"])]), // gap = 10
      analysis(fens[1]!, 300, "c5c4"),
    ];
    expect(detectBrilliantMoves(NON_SAC_GAME, analyses)).toHaveLength(0);
  });

  it("rejects a move whose resulting value falls short of the engine's top line", () => {
    // The played move (a1c3) only achieves +20 for White, while the
    // engine's own top line (a different move) promised +300 — the
    // played move fell well short of the best available continuation.
    const fens = [NON_SAC_GAME.initialFen, NON_SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "h1g1", [line(1, 300, ["h1g1"]), line(2, -150, ["a1c3"])]),
      analysis(fens[1]!, 20, "c5c4"),
    ];
    expect(detectBrilliantMoves(NON_SAC_GAME, analyses)).toHaveLength(0);
  });

  it("accepts a played move that ties the engine's top line even if it isn't literally `bestMove`", () => {
    // Two different moves are genuinely tied for best (same value); the
    // engine's choice of which one to report as "bestmove" isn't
    // guaranteed stable, so a value-based comparison must still accept
    // the one that was actually played.
    const fens = [NON_SAC_GAME.initialFen, NON_SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "h1g1", [line(1, 20, ["h1g1"]), line(2, -150, ["h1h2"])]),
      analysis(fens[1]!, 300, "c5c4"),
    ];
    const candidates = detectBrilliantMoves(NON_SAC_GAME, analyses);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.ply.san).toBe("Bc3");
  });

  it("rejects a move when the position was already crushing beforehand", () => {
    const fens = [SAC_GAME.initialFen, SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 900, "a1d4", [line(1, 900, ["a1d4"]), line(2, 100, ["h1g1"])]),
      analysis(fens[1]!, 950, "c5d4"),
    ];
    expect(detectBrilliantMoves(SAC_GAME, analyses)).toHaveLength(0);
  });

  it("rejects a move whose resulting position isn't clearly good for the mover", () => {
    const fens = [SAC_GAME.initialFen, SAC_GAME.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "a1d4", [line(1, 20, ["a1d4"]), line(2, -150, ["h1g1"])]),
      analysis(fens[1]!, 30, "c5d4"), // barely better, not a real advantage
    ];
    expect(detectBrilliantMoves(SAC_GAME, analyses)).toHaveLength(0);
  });
});

describe("selectBrilliantMove", () => {
  const fens = [SAC_GAME.initialFen, SAC_GAME.plies[0]!.fenAfter];
  const analyses = [
    analysis(fens[0]!, 20, "a1d4", [line(1, 20, ["a1d4"]), line(2, -150, ["h1g1"])]),
    analysis(fens[1]!, 300, "c5d4"),
  ];

  it("picks the most severe detected candidate by default", () => {
    const chosen = selectBrilliantMove(SAC_GAME, analyses);
    expect(chosen.plyIndex).toBe(0);
  });

  it("honors an explicit --move override even below threshold", () => {
    const flatAnalyses = [analysis(fens[0]!, 10, "h1g1"), analysis(fens[1]!, 10, "c5d4")];
    const chosen = selectBrilliantMove(SAC_GAME, flatAnalyses, { moveOverride: 1 });
    expect(chosen.plyIndex).toBe(0);
    expect(chosen.ply.san).toBe("Bd4");
  });

  it("rejects an out-of-range --move override", () => {
    expect(() => selectBrilliantMove(SAC_GAME, analyses, { moveOverride: 99 })).toThrow(
      StoryConstructionError,
    );
  });

  it("throws when no candidate qualifies and no override is given", () => {
    const flatAnalyses = [analysis(fens[0]!, 10, "h1g1"), analysis(fens[1]!, 10, "c5d4")];
    expect(() => selectBrilliantMove(SAC_GAME, flatAnalyses)).toThrow(StoryConstructionError);
  });
});

describe("buildBrilliantStory", () => {
  const fens = [SAC_GAME.initialFen, SAC_GAME.plies[0]!.fenAfter];
  const analyses = [
    analysis(fens[0]!, 20, "a1d4", [line(1, 20, ["a1d4"]), line(2, -150, ["h1g1"])]),
    // PV starting from the position after Bd4: Black takes it (cxd4),
    // demonstrating the sacrifice being accepted.
    analysis(fens[1]!, 300, "c5d4", [line(1, 300, ["c5d4"])]),
  ];

  it("builds a timeline with hook, freeze/prompt, countdown, reveal, move, continuation, payoff", () => {
    const candidate: BrilliantCandidate = selectBrilliantMove(SAC_GAME, analyses);
    const timeline = buildBrilliantStory(SAC_GAME, candidate, {
      countdownSeconds: 3,
      showEval: true,
    });
    // HOOK 1 + LEAD_IN(0 plies, it's ply 0) + PROMPT 1.5 + COUNTDOWN 3
    // + REVEAL 1 + MOVE 1.5 + CONTINUATION(1 ply gets the whole 6s budget,
    // since perPly = max(1.0, 6.0 / pliesCount) = 6.0 here) + PAYOFF 3
    const expectedDuration = 1 + 0 + 1.5 + 3 + 1 + 1.5 + 6 + 3;
    expect(timeline.duration).toBeCloseTo(expectedDuration, 5);
  });

  it("never shows arrows/highlights/evaluation before the reveal", () => {
    const candidate = selectBrilliantMove(SAC_GAME, analyses);
    const timeline = buildBrilliantStory(SAC_GAME, candidate, {
      countdownSeconds: 3,
      showEval: true,
    });
    const revealStart = 1 + 0 + 1.5 + 3; // HOOK + LEAD_IN + PROMPT + COUNTDOWN
    for (let t = 0; t < revealStart; t += 0.2) {
      const state = stateAtTime(timeline, t);
      expect(state.arrows ?? []).toHaveLength(0);
      expect(state.highlights ?? []).toHaveLength(0);
      expect(state.evaluation).toBeUndefined();
    }
  });

  it("shows the reveal highlight/arrow exactly at the reveal boundary", () => {
    const candidate = selectBrilliantMove(SAC_GAME, analyses);
    const timeline = buildBrilliantStory(SAC_GAME, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const revealStart = 1 + 0 + 1.5 + 3;
    const state = stateAtTime(timeline, revealStart);
    expect(state.highlights).toEqual([
      { square: "a1", style: "origin" },
      { square: "d4", style: "destination" },
    ]);
    expect(state.arrows).toEqual([{ from: "a1", to: "d4", color: "#6B1F2A", opacity: 0.9 }]);
    expect(state.moveAnimation).toBeUndefined();
  });

  it("annotates the payoff move label with !! for a sacrifice, ! otherwise", () => {
    const sacCandidate = selectBrilliantMove(SAC_GAME, analyses);
    const sacTimeline = buildBrilliantStory(SAC_GAME, sacCandidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const sacPayoff = stateAtTime(sacTimeline, sacTimeline.duration);
    expect(sacPayoff.moveLabel?.text).toBe("Bd4!!");

    const nonSacFens = [NON_SAC_GAME.initialFen, NON_SAC_GAME.plies[0]!.fenAfter];
    const nonSacAnalyses = [
      analysis(nonSacFens[0]!, 20, "a1c3", [line(1, 20, ["a1c3"]), line(2, -150, ["h1g1"])]),
      analysis(nonSacFens[1]!, 300, "c5c4"),
    ];
    const nonSacCandidate = selectBrilliantMove(NON_SAC_GAME, nonSacAnalyses);
    const nonSacTimeline = buildBrilliantStory(NON_SAC_GAME, nonSacCandidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const nonSacPayoff = stateAtTime(nonSacTimeline, nonSacTimeline.duration);
    expect(nonSacPayoff.moveLabel?.text).toBe("Bc3!");
  });

  it("omits evaluation entirely when showEval is false", () => {
    const candidate = selectBrilliantMove(SAC_GAME, analyses);
    const timeline = buildBrilliantStory(SAC_GAME, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    for (const segment of timeline.segments) {
      expect(segment.state.evaluation).toBeUndefined();
    }
  });

  it("defaults orientation to the mover's own side", () => {
    const candidate = selectBrilliantMove(SAC_GAME, analyses); // Bd4, played by white
    const timeline = buildBrilliantStory(SAC_GAME, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    expect(timeline.segments[0]!.state.position.orientation).toBe("white");
  });
});
