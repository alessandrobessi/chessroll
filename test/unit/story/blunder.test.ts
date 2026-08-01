import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import {
  buildBlunderStory,
  detectBlunders,
  selectBlunder,
  type BlunderCandidate,
} from "../../../src/story/blunder.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";
import { StoryConstructionError } from "../../../src/utils/errors.js";

// 4 plies: e4 (white), e5 (black), Nf3 (white), Nc6 (black).
const GAME = loadPgn("1. e4 e5 2. Nf3 Nc6 *");
const FENS = [GAME.initialFen, ...GAME.plies.map((p) => p.fenAfter)]; // length 5

function analysis(
  fen: string,
  whitePerspectiveCp: number,
  pv: string[] = ["a2a3"],
): PositionAnalysis {
  return {
    fen,
    engineVersion: "test",
    depth: 12,
    bestMove: pv[0]!,
    score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
    pv,
    multipv: [
      {
        rank: 1,
        score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
        moves: pv,
      },
    ],
  };
}

describe("detectBlunders", () => {
  it("flags a large swing against the mover and ignores small ones", () => {
    // Roughly balanced until Nc6 (ply 3, Black to move): a huge swing to
    // +350 for White is a ~330cp loss for Black, the mover.
    const analyses = [
      analysis(FENS[0]!, 20),
      analysis(FENS[1]!, 30),
      analysis(FENS[2]!, 25),
      analysis(FENS[3]!, 20),
      analysis(FENS[4]!, 350, ["h1h8"]),
    ];

    const candidates = detectBlunders(GAME, analyses);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.plyIndex).toBe(3);
    expect(candidates[0]!.ply.san).toBe("Nc6");
    expect(candidates[0]!.severity).toBeCloseTo(330, 5);
  });

  it("skips a further loss when the mover's position was already essentially lost", () => {
    // Black (mover of ply 3) is already down ~9 pawns before Nc6.
    const analyses = [
      analysis(FENS[0]!, 20),
      analysis(FENS[1]!, 30),
      analysis(FENS[2]!, 25),
      analysis(FENS[3]!, 900),
      analysis(FENS[4]!, 1200),
    ];
    expect(detectBlunders(GAME, analyses)).toHaveLength(0);
  });

  it("ranks multiple candidates most-severe first", () => {
    // ply0 (e4, white): 0 -> -400 (white perspective): severity 400 for White.
    // ply1 (e5, black): -400 -> -50: mover(black) 400 -> 50, severity 350.
    // ply2 (Nf3, white): -50 -> -370: severity 320 for White.
    // ply3 (Nc6, black): -370 -> -370: severity 0, not flagged.
    const analyses = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, -400),
      analysis(FENS[2]!, -50),
      analysis(FENS[3]!, -370),
      analysis(FENS[4]!, -370),
    ];
    const candidates = detectBlunders(GAME, analyses);
    expect(candidates.map((c) => c.plyIndex)).toEqual([0, 1, 2]);
    expect(candidates[0]!.severity).toBeCloseTo(400, 5);
    expect(candidates[1]!.severity).toBeCloseTo(350, 5);
    expect(candidates[2]!.severity).toBeCloseTo(320, 5);
  });
});

describe("selectBlunder", () => {
  const analyses = [
    analysis(FENS[0]!, 20),
    analysis(FENS[1]!, 30),
    analysis(FENS[2]!, 25),
    analysis(FENS[3]!, 20),
    analysis(FENS[4]!, 350, ["h1h8"]),
  ];

  it("picks the most severe detected candidate by default", () => {
    const chosen = selectBlunder(GAME, analyses);
    expect(chosen.plyIndex).toBe(3);
  });

  it("honors an explicit --move override even below threshold", () => {
    // ply 1 (e5) has almost no swing and would never be auto-detected,
    // but an explicit override must win regardless.
    const chosen = selectBlunder(GAME, analyses, { moveOverride: 2 }); // 1-based -> plyIndex 1
    expect(chosen.plyIndex).toBe(1);
    expect(chosen.ply.san).toBe("e5");
  });

  it("rejects an out-of-range --move override", () => {
    expect(() => selectBlunder(GAME, analyses, { moveOverride: 99 })).toThrow(
      StoryConstructionError,
    );
  });

  it("throws when no candidate qualifies and no override is given", () => {
    const flatAnalyses = FENS.map((fen) => analysis(fen, 10));
    expect(() => selectBlunder(GAME, flatAnalyses)).toThrow(StoryConstructionError);
  });
});

describe("buildBlunderStory", () => {
  const analyses = [
    analysis(FENS[0]!, 20),
    analysis(FENS[1]!, 30),
    analysis(FENS[2]!, 25),
    analysis(FENS[3]!, 20),
    // ply 3 (Nc6) blunders; punishment PV starts with a legal reply to the
    // resulting position (white to move): Bc4 develops fine.
    analysis(FENS[4]!, 350, ["f1c4"]),
  ];

  it("builds a timeline with lead-in, freeze, countdown, blunder, swing, punishment, payoff", () => {
    const candidate: BlunderCandidate = selectBlunder(GAME, analyses);
    const timeline = buildBlunderStory(GAME, candidate, { countdownSeconds: 3, showEval: true });

    // HOOK 1 + LEAD_IN(3 plies: e4,e5,Nf3) * 0.4 + FREEZE 1 + COUNTDOWN 3
    // + BLUNDER 1.2 + SWING 1.5 + PUNISHMENT 1.2 + PAYOFF 3
    const expectedDuration = 1 + 3 * 0.4 + 1 + 3 + 1.2 + 1.5 + 1.2 + 3;
    expect(timeline.duration).toBeCloseTo(expectedDuration, 5);
  });

  it("never shows arrows/highlights/evaluation before the blunder move animates", () => {
    const candidate = selectBlunder(GAME, analyses);
    const timeline = buildBlunderStory(GAME, candidate, { countdownSeconds: 3, showEval: true });
    const blunderStart = 1 + 3 * 0.4 + 1 + 3; // HOOK + LEAD_IN + FREEZE + COUNTDOWN
    for (let t = 0; t < blunderStart; t += 0.2) {
      const state = stateAtTime(timeline, t);
      expect(state.highlights ?? []).toHaveLength(0);
      expect(state.evaluation).toBeUndefined();
    }
  });

  it("shows the swing highlight and evaluation right after the blunder animates", () => {
    const candidate = selectBlunder(GAME, analyses);
    const timeline = buildBlunderStory(GAME, candidate, { countdownSeconds: 3, showEval: true });
    const swingStart = 1 + 3 * 0.4 + 1 + 3 + 1.2;
    const state = stateAtTime(timeline, swingStart);
    expect(state.highlights).toEqual([{ square: candidate.ply.to, style: "critical" }]);
    expect(state.evaluation).toEqual({ display: "+3.5", perspective: "white" });
  });

  it("omits evaluation entirely when showEval is false", () => {
    const candidate = selectBlunder(GAME, analyses);
    const timeline = buildBlunderStory(GAME, candidate, { countdownSeconds: 3, showEval: false });
    for (const segment of timeline.segments) {
      expect(segment.state.evaluation).toBeUndefined();
    }
  });

  it("defaults orientation to the blunderer's own side", () => {
    const candidate = selectBlunder(GAME, analyses); // Nc6, played by black
    const timeline = buildBlunderStory(GAME, candidate, { countdownSeconds: 3, showEval: false });
    expect(timeline.segments[0]!.state.position.orientation).toBe("black");
  });
});
