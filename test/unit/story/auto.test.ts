import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import { planAutoStories, slugForPly } from "../../../src/story/auto.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

function pgnFromFen(fen: string, move: string): string {
  return `[SetUp "1"]\n[FEN "${fen}"]\n\n1. ${move} *`;
}

function analysis(
  fen: string,
  whitePerspectiveCp: number,
  bestMove = "",
  multipv: PositionAnalysis["multipv"] = [],
): PositionAnalysis {
  return {
    fen,
    engineVersion: "test",
    depth: 12,
    bestMove,
    score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
    pv: bestMove ? [bestMove] : [],
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

// 6 plies: e4(0) e5(1) Nf3(2) Nc6(3) Bc4(4) Bc5(5) — no multipv anywhere in
// this fixture, so detectBrilliantMoves can never find a candidate here
// (it requires a rank-1 line); this isolates the blunder+puzzle-fallback
// behavior without any brilliant-detection interference.
const GAME = loadPgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *");
const FENS = [GAME.initialFen, ...GAME.plies.map((p) => p.fenAfter)]; // length 7

describe("planAutoStories", () => {
  it("detects the one real blunder, excludes it from puzzles, and ranks the rest by swing magnitude", () => {
    const analyses = [
      analysis(FENS[0]!, 0), // start
      analysis(FENS[1]!, 10), // e4 (white): swing 10 -> quiet
      analysis(FENS[2]!, 200), // e5 (black): swing -190 -> inaccuracy (puzzle candidate, magnitude 190)
      analysis(FENS[3]!, 450), // Nf3 (white): swing 250 -> great, not a sacrifice (puzzle candidate, magnitude 250)
      analysis(FENS[4]!, 900), // Nc6 (black): swing -450 -> blunder (severity 450)
      analysis(FENS[5]!, 910), // Bc4 (white): swing 10 -> quiet
      analysis(FENS[6]!, 905), // Bc5 (black): swing 5 -> quiet
    ];

    const plan = planAutoStories(GAME, analyses);

    expect(plan.blunders).toHaveLength(1);
    expect(plan.blunders[0]!.ply.san).toBe("Nc6");
    expect(plan.blunders[0]!.severity).toBeCloseTo(450, 5);

    expect(plan.brilliants).toHaveLength(0);

    // Nc6 (the blunder) never appears here; the rest are ranked by |swing|.
    expect(plan.puzzles.map((p) => p.ply.san)).toEqual(["Nf3", "e5"]);
    expect(plan.puzzles.every((p) => p.ply.san !== "Nc6")).toBe(true);
    // Each puzzle's analysis is the position BEFORE its ply, not after.
    expect(plan.puzzles[0]!.analysis.fen).toBe(FENS[2]!);
  });

  it("caps each category independently via maxPerCategory", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 10),
      analysis(FENS[2]!, 200), // inaccuracy, magnitude 190
      analysis(FENS[3]!, 450), // great, magnitude 250
      analysis(FENS[4]!, 900), // blunder
      analysis(FENS[5]!, 910),
      analysis(FENS[6]!, 905),
    ];

    const plan = planAutoStories(GAME, analyses, { maxPerCategory: 1 });
    expect(plan.puzzles).toHaveLength(1);
    expect(plan.puzzles[0]!.ply.san).toBe("Nf3"); // the larger-magnitude one wins the single slot
  });

  it("excludes a blunder candidate from the blunder list when it's actually a miss, but still surfaces it as a puzzle", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 10), // e4 (white): quiet
      analysis(FENS[2]!, 0), // e5 (black): quiet, so Nf3 below is a genuine blunder, not a miss
      // Nf3 (white): swing -350 -> a real blunder, gifting Black a big
      // opportunity (rank1 promises +900 for Black from here).
      analysis(FENS[3]!, -350, "", [
        { rank: 1, score: { type: "cp", value: -900, perspective: "white" }, moves: [] },
      ]),
      // Nc6 (black): only achieves 0 (swing -350, a "blunder" by its own
      // severity too) — but 900cp short of the +900 rank1 promised right
      // after White's own blunder, so it's really a miss, not a fresh one.
      analysis(FENS[4]!, 0),
      analysis(FENS[5]!, 10), // Bc4 (white): quiet
      analysis(FENS[6]!, 5), // Bc5 (black): quiet
    ];

    const plan = planAutoStories(GAME, analyses);

    expect(plan.blunders).toHaveLength(1);
    expect(plan.blunders[0]!.ply.san).toBe("Nf3"); // White's real blunder, kept
    expect(plan.blunders.some((c) => c.ply.san === "Nc6")).toBe(false); // excluded: it's a miss, not a blunder

    expect(plan.puzzles.map((p) => p.ply.san)).toContain("Nc6"); // still surfaced, just as a puzzle
  });

  it("detects a brilliant candidate and excludes it from the puzzle pool", () => {
    const sacGame = loadPgn(pgnFromFen("6k1/8/8/2p5/8/8/8/B6K w - - 0 1", "Bd4"));
    const fens = [sacGame.initialFen, sacGame.plies[0]!.fenAfter];
    const analyses = [
      analysis(fens[0]!, 20, "a1d4", [line(1, 20, ["a1d4"]), line(2, -150, ["h1g1"])]),
      analysis(fens[1]!, 300, "c5d4"),
    ];

    const plan = planAutoStories(sacGame, analyses);
    expect(plan.brilliants).toHaveLength(1);
    expect(plan.brilliants[0]!.isSacrifice).toBe(true);
    expect(plan.puzzles).toHaveLength(0); // the game's only ply is covered
  });
});

describe("slugForPly", () => {
  it("builds a filesystem-safe, meaningful basename from the move number and SAN", () => {
    const chess = loadPgn("1. e4 e5 *");
    expect(slugForPly(chess.plies[0]!)).toBe("1-e4"); // white: "1."
    expect(slugForPly(chess.plies[1]!)).toBe("1-e5"); // black: "1..."
  });

  it("strips capture/check/mate punctuation from the SAN into plain dashes", () => {
    const chess = loadPgn('[SetUp "1"]\n[FEN "6k1/8/8/4b3/8/8/8/K3R3 w - - 0 1"]\n\n1. Rxe5+ *');
    expect(slugForPly(chess.plies[0]!)).toBe("1-Rxe5");
  });
});
