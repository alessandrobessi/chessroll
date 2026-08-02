import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import { buildGuessStory, selectGuessMove } from "../../../src/story/guess.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";
import { StoryConstructionError } from "../../../src/utils/errors.js";

const GAME = loadPgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *");
const FENS = [GAME.initialFen, ...GAME.plies.map((p) => p.fenAfter)]; // length 7

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

describe("selectGuessMove", () => {
  it("honors an explicit --move override, bypassing detection entirely", () => {
    const analyses = FENS.map((fen) => analysis(fen, 0));
    const chosen = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // 1-based -> plyIndex 2
    expect(chosen.plyIndex).toBe(2);
    expect(chosen.ply.san).toBe("Nf3");
  });

  it("rejects an out-of-range --move override", () => {
    const analyses = FENS.map((fen) => analysis(fen, 0));
    expect(() => selectGuessMove(GAME, analyses, { moveOverride: 99 })).toThrow(
      StoryConstructionError,
    );
  });

  it("auto-detects the single largest-magnitude swing, with no minimum severity threshold", () => {
    // Every ply here is a tiny, ordinary swing (far below blunder/brilliant's
    // own 150-300cp thresholds) — guess must still pick the biggest one
    // rather than finding "nothing qualifies".
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 5), // e4: swing 5
      analysis(FENS[2]!, -20), // e5: swing 25 (mover black: -(-20)-(-5)=25)
      analysis(FENS[3]!, -5), // Nf3: swing 15
      analysis(FENS[4]!, 30), // Nc6: swing -(30)-(-(-5))=... computed below
      analysis(FENS[5]!, 0), // Bc4
      analysis(FENS[6]!, -60), // Bc5: largest magnitude
    ];
    const chosen = selectGuessMove(GAME, analyses);
    // Sanity: whichever ply wins, it must be the max |swing| — cross-check
    // against a plain re-computation instead of hand-picking an index, so
    // this test doesn't silently rot if the fabricated numbers above change.
    let expectedIndex = 0;
    let expectedMagnitude = -Infinity;
    for (let i = 0; i < GAME.plies.length; i++) {
      const mover = GAME.plies[i]!.side;
      const sign = mover === "white" ? 1 : -1;
      const swing = (analyses[i + 1]!.score.value - analyses[i]!.score.value) * sign;
      if (Math.abs(swing) > expectedMagnitude) {
        expectedMagnitude = Math.abs(swing);
        expectedIndex = i;
      }
    }
    expect(chosen.plyIndex).toBe(expectedIndex);
  });
});

describe("buildGuessStory", () => {
  it("builds the full phase sequence with the correct total duration", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 0),
      analysis(FENS[2]!, 20, "g1f3", [line(1, 20, ["g1f3"])]),
      analysis(FENS[3]!, 25),
      analysis(FENS[4]!, 25),
      analysis(FENS[5]!, 25),
      analysis(FENS[6]!, 20),
    ];
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // Nf3
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: true,
    });
    // HOOK 1 + LEAD_IN(2 plies * 0.4) + FREEZE 1 + YOU_ARE 1.5 + PROMPT 1.5
    // + COUNTDOWN 3 + REVEAL 1 + MOVE 1.5 + COMPARISON 2.5
    // + CONTINUATION(3 plies * 2.0, since 6.0/3=2.0) + PAYOFF 3
    expect(timeline.duration).toBeCloseTo(22.8, 5);
  });

  it("personalizes the 'You are' title to the actual mover, falling back to White/Black", () => {
    const analyses = FENS.map((fen) => analysis(fen, 0, "", [line(1, 0, [])]));
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // Nf3, white
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const youAreStart = 1 + 2 * 0.4 + 1; // HOOK + LEAD_IN + FREEZE
    const state = stateAtTime(timeline, youAreStart + 0.1);
    expect(state.title?.text).toBe("YOU ARE WHITE"); // GAME has no White/Black headers set
  });

  it("shows 'matches Stockfish's top choice' when the played move ties the engine's own top line", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 0),
      analysis(FENS[2]!, 20, "g1f3", [line(1, 20, ["g1f3"])]),
      analysis(FENS[3]!, 25), // played value 25 >= rank1 value 20 - 5 -> matches
      analysis(FENS[4]!, 25),
      analysis(FENS[5]!, 25),
      analysis(FENS[6]!, 20),
    ];
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // Nf3
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const comparisonStart = 1 + 2 * 0.4 + 1 + 1.5 + 1.5 + 3 + 1 + 1.5; // through MOVE
    const state = stateAtTime(timeline, comparisonStart + 0.1);
    expect(state.prompt?.text).toBe("MATCHES STOCKFISH'S TOP CHOICE");
    expect(state.prompt?.emphasis).toBe(true);
    expect(state.moveLabel?.text).toBe("Nf3");
  });

  it("honestly shows what Stockfish preferred instead when the played move doesn't match, never claiming it was best", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 0),
      analysis(FENS[2]!, 0),
      analysis(FENS[3]!, 0),
      analysis(FENS[4]!, 40, "d2d4", [line(1, 40, ["d2d4"])]), // before Bc4: engine prefers d4
      analysis(FENS[5]!, 10), // after Bc4: played value 10 << rank1 value 40-5 -> doesn't match
      analysis(FENS[6]!, 10),
    ];
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 5 }); // Bc4
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    const comparisonStart = 1 + 4 * 0.4 + 1 + 1.5 + 1.5 + 3 + 1 + 1.5; // through MOVE (4 lead-in plies now)
    const state = stateAtTime(timeline, comparisonStart + 0.1);
    expect(state.prompt?.text).toBe("STOCKFISH PREFERRED D4 INSTEAD");
    expect(state.prompt?.emphasis).toBeFalsy();
  });

  it("continues with the real game's own next moves, not an engine PV replay", () => {
    const analyses = FENS.map((fen) => analysis(fen, 0, "", [line(1, 0, [])]));
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // Nf3
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: false,
    });
    // Continuation starts right after COMPARISON.
    const continuationStart = 1 + 2 * 0.4 + 1 + 1.5 + 1.5 + 3 + 1 + 1.5 + 2.5;
    const firstContinuationMove = stateAtTime(timeline, continuationStart + 0.1);
    expect(firstContinuationMove.moveAnimation).toMatchObject({ from: "b8", to: "c6" }); // Nc6
  });

  it("shows the final payoff position and evaluation after the real continuation, not just the guessed move's own", () => {
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 0),
      analysis(FENS[2]!, 20, "g1f3", [line(1, 20, ["g1f3"])]),
      analysis(FENS[3]!, 25),
      analysis(FENS[4]!, 30),
      analysis(FENS[5]!, 35),
      analysis(FENS[6]!, 42), // the true final position's eval
    ];
    const candidate = selectGuessMove(GAME, analyses, { moveOverride: 3 }); // Nf3
    const timeline = buildGuessStory(GAME, analyses, candidate, {
      countdownSeconds: 3,
      showEval: true,
    });
    const payoff = stateAtTime(timeline, timeline.duration);
    expect(payoff.moveLabel?.text).toBe("Bc5"); // the game's actual last ply
    expect(payoff.evaluation?.display).toBe("+0.4"); // FENS[6]'s analysis (42cp), not FENS[3]'s (25cp)
  });
});
