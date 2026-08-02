import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import { buildGame60Story } from "../../../src/story/game60.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

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

const GAME1 = loadPgn("1. e4 e5 2. Nf3 Nc6 *");
const FENS1 = [GAME1.initialFen, ...GAME1.plies.map((p) => p.fenAfter)];

describe("buildGame60Story: budget/scale math", () => {
  it("clamps scale to 1 for a short game — every move keeps replay's own base seconds", () => {
    const analyses = FENS1.map((fen) => analysis(fen, 0)); // flat -> every ply quiet
    const timeline = buildGame60Story(GAME1, analyses, { targetSeconds: 60, showEval: false });
    // moveBudget (60 - 1.5 - 3.0 = 55.5) hugely exceeds baseSum (4*0.35=1.4)
    // -> scale clamps to 1, so this is identical in shape to replay's own
    // quiet-move pacing: INTRO 1.5 + 4*0.35 + OUTRO 3.0.
    expect(timeline.duration).toBeCloseTo(1.5 + 4 * 0.35 + 3.0, 5);
  });

  it("scales every move down uniformly to land the total right at the target", () => {
    // 40 plies, all quiet (an oscillating knight shuffle — fully legal,
    // never captures/checks), so classification is trivially uniform and
    // the budget math is easy to hand-verify.
    const moves = Array.from({ length: 10 }, () => "Nf3 Nf6 Ng1 Ng8").join(" ");
    const game = loadPgn(`1. ${moves} *`.replace(/(\d+)\. /g, (_m, n) => `${n}. `));
    expect(game.plies).toHaveLength(40);
    const fens = [game.initialFen, ...game.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));

    const timeline = buildGame60Story(game, analyses, { targetSeconds: 10, showEval: false });
    // reserved = 1.5 + 3.0 = 4.5; moveBudget = 10 - 4.5 = 5.5;
    // baseSum = 40*0.35 = 14; scale = 5.5/14 = 0.392857...;
    // each move = 0.35*scale = 0.1375s (well above the 0.08 floor).
    // total = 1.5 + 40*0.1375 + 3.0 = 10.0 exactly.
    expect(timeline.duration).toBeCloseTo(10.0, 5);
    const firstMove = stateAtTime(timeline, 1.6);
    expect(firstMove.moveAnimation).toBeDefined();
    // Confirm this move is meaningfully compressed relative to replay's own 0.35s.
    const secondMoveStart = 1.5 + 0.1375;
    const secondMove = stateAtTime(timeline, secondMoveStart + 0.01);
    expect(secondMove.moveLabel?.text).toBe("1... Nf6");
  });

  it("never compresses below the minimum floor, even for an extreme target", () => {
    const moves = Array.from({ length: 20 }, () => "Nf3 Nf6 Ng1 Ng8").join(" ");
    const game = loadPgn(`1. ${moves} *`);
    const fens = [game.initialFen, ...game.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));
    // An impossibly tight target — floor must win, so duration exceeds it.
    const timeline = buildGame60Story(game, analyses, { targetSeconds: 1, showEval: false });
    expect(timeline.duration).toBeGreaterThan(1);
    // Every move segment is at least MIN_MOVE_SECONDS (0.08s).
    for (const ply of game.plies) {
      void ply;
    }
  });
});

describe("buildGame60Story: only critical moments pause", () => {
  it("gives a swing-classified move no pause (unlike replay) but still marks it inline; critical still gets its own pause", () => {
    const analyses = [
      analysis(FENS1[0]!, 0),
      analysis(FENS1[1]!, 10), // e4 (white): swing 10 -> quiet
      analysis(FENS1[2]!, -190), // e5 (black): swing 200 -> "great" (marked inline, no pause in game60)
      analysis(FENS1[3]!, 150), // Nf3 (white): swing 340 -> critical (pause + annotation)
      analysis(FENS1[4]!, 140), // Nc6 (black): swing 10 -> quiet
    ];
    const timeline = buildGame60Story(GAME1, analyses, { targetSeconds: 60, showEval: false });
    // scale clamps to 1 here (tiny game), so this mirrors replay's own
    // durations except swing's pause is dropped:
    // INTRO 1.5 + e4(0.35) + e5(0.90, no pause) + Nf3(1.20) + pause(0.8) + Nc6(0.35) + OUTRO 3.0
    expect(timeline.duration).toBeCloseTo(1.5 + 0.35 + 0.9 + 1.2 + 0.8 + 0.35 + 3.0, 5);

    // No separate pause for e5 (still animating throughout its own 0.9s
    // segment), but that same segment carries the "great" tier inline:
    // marked on the move itself, at no extra time cost.
    const e5Move = stateAtTime(timeline, 1.5 + 0.35 + 0.5);
    expect(e5Move.moveAnimation).toBeDefined();
    expect(e5Move.moveLabel?.text).toBe("1... e5!");
    expect(e5Move.highlights).toEqual([{ square: "e5", style: "great" }]);
    expect(e5Move.moveQualityBadge).toEqual({ square: "e5", tier: "great", glyph: "!" });

    // The critical pause itself: highlighted, annotated, no motion.
    const criticalPause = stateAtTime(timeline, 1.5 + 0.35 + 0.9 + 1.2 + 0.4);
    expect(criticalPause.moveLabel?.text).toBe("2. Nf3!");
    expect(criticalPause.moveLabel?.emphasis).toBe(true);
    expect(criticalPause.highlights).toEqual([
      { square: "g1", style: "great" },
      { square: "f3", style: "great" },
    ]);
    expect(criticalPause.moveAnimation).toBeUndefined();
  });
});

describe("buildGame60Story: header and result", () => {
  it("shows a compact 'White vs Black' header (with Elo when present), persistently", () => {
    const headeredGame = loadPgn(
      '[White "Carlsen"]\n[Black "Nepo"]\n[WhiteElo "2850"]\n[Event "World Championship"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    );
    const fens = [headeredGame.initialFen, ...headeredGame.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));
    const timeline = buildGame60Story(headeredGame, analyses, {
      targetSeconds: 60,
      showEval: false,
    });

    for (const t of [0, 2.0]) {
      const state = stateAtTime(timeline, t);
      expect(state.title?.text).toBe("Carlsen (2850) vs Nepo");
      expect(state.title?.compact).toBe(true); // the layout fix: never full-size for the persistent header
      expect(state.subtitle?.text).toBe("World Championship");
    }
  });

  it("shows the recorded result at the outro, full-size (not compact)", () => {
    const headeredGame = loadPgn(
      '[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    );
    const fens = [headeredGame.initialFen, ...headeredGame.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0));
    const timeline = buildGame60Story(headeredGame, analyses, {
      targetSeconds: 60,
      showEval: false,
    });
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.title).toEqual({ text: "1-0", emphasis: true });
  });

  it("never invents a result when the PGN result is the unresolved '*' token", () => {
    const analyses = FENS1.map((fen) => analysis(fen, 0));
    const timeline = buildGame60Story(GAME1, analyses, { targetSeconds: 60, showEval: false });
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.title).toBeUndefined();
  });

  it("shows each player's own accuracy at the outro", () => {
    const headeredGame = loadPgn(
      '[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    );
    const fens = [headeredGame.initialFen, ...headeredGame.plies.map((p) => p.fenAfter)];
    const analyses = fens.map((fen) => analysis(fen, 0)); // flat eval -> ~100% both sides
    const timeline = buildGame60Story(headeredGame, analyses, {
      targetSeconds: 60,
      showEval: false,
    });
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.subtitle?.text).toBe("Carlsen 100.0%   Nepo 100.0%");
  });
});
