import { describe, expect, it } from "vitest";
import { buildPuzzleStory } from "../../../src/story/puzzle.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

const PUZZLE_FEN = "6k1/8/8/8/8/8/R7/K6R w - - 0 1";
const PUZZLE_ANALYSIS: PositionAnalysis = {
  fen: PUZZLE_FEN,
  engineVersion: "Stockfish 18",
  depth: 12,
  bestMove: "a2a7",
  score: { type: "mate", value: 2, perspective: "white" },
  pv: ["a2a7", "g8f8", "h1h8"],
  multipv: [
    {
      rank: 1,
      score: { type: "mate", value: 2, perspective: "white" },
      moves: ["a2a7", "g8f8", "h1h8"],
    },
  ],
};

const MATE_IN_1_FEN = "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1";
const MATE_IN_1_ANALYSIS: PositionAnalysis = {
  fen: MATE_IN_1_FEN,
  engineVersion: "Stockfish 18",
  depth: 12,
  bestMove: "e1e8",
  score: { type: "mate", value: 1, perspective: "white" },
  pv: ["e1e8"],
  multipv: [{ rank: 1, score: { type: "mate", value: 1, perspective: "white" }, moves: ["e1e8"] }],
};

describe("buildPuzzleStory", () => {
  it("produces the expected ~19s default duration (countdown=5, 2 extra plies)", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: false,
    });
    // INTRO 1 + PROMPT 1.5 + SOLVE 5 + REVEAL 1 + MOVE 1.5 + CONTINUATION 6 + PAYOFF 3
    expect(timeline.duration).toBe(19);
  });

  it("never populates arrows/highlights/evaluation before REVEAL", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: true,
    });
    const revealStart = 1 + 1.5 + 5; // INTRO + PROMPT + SOLVE
    for (let t = 0; t < revealStart; t += 0.25) {
      const state = stateAtTime(timeline, t);
      expect(state.arrows ?? []).toHaveLength(0);
      expect(state.highlights ?? []).toHaveLength(0);
      expect(state.evaluation).toBeUndefined();
    }
  });

  it("shows the reveal highlight/arrow exactly at the REVEAL boundary", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: false,
    });
    const revealStart = 1 + 1.5 + 5;
    const state = stateAtTime(timeline, revealStart);
    expect(state.highlights).toEqual([
      { square: "a2", style: "origin" },
      { square: "a7", style: "destination" },
    ]);
    expect(state.arrows).toEqual([{ from: "a2", to: "a7", color: "#6B1F2A", opacity: 0.9 }]);
    expect(state.moveAnimation).toBeUndefined();
  });

  it("animates the best move starting exactly at the MOVE boundary", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: false,
    });
    const moveStart = 1 + 1.5 + 5 + 1; // + REVEAL
    const state = stateAtTime(timeline, moveStart);
    expect(state.moveAnimation).toMatchObject({ from: "a2", to: "a7", start: moveStart });
    // The static position layer must show the BEFORE-move FEN, per
    // board/render.ts's contract for MOVE segments.
    expect(state.position.fen).toBe(PUZZLE_FEN);
  });

  it("shows the final position and move label at PAYOFF, with evaluation only when opted in", () => {
    const withEval = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: true,
    });
    const payoffStart = 1 + 1.5 + 5 + 1 + 1.5 + 6; // + MOVE + CONTINUATION
    const state = stateAtTime(withEval, payoffStart);
    expect(state.moveLabel?.text).toBe("Rh8#");
    expect(state.evaluation).toEqual({ display: "M2", perspective: "white", barFraction: 1 });

    const withoutEval = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: false,
    });
    for (const segment of withoutEval.segments) {
      expect(segment.state.evaluation).toBeUndefined();
    }
  });

  it("degrades gracefully to zero continuation segments for a mate-in-1", () => {
    const timeline = buildPuzzleStory(MATE_IN_1_FEN, "white", MATE_IN_1_ANALYSIS, {
      countdownSeconds: 3,
      showEval: false,
    });
    // INTRO 1 + PROMPT 1.5 + SOLVE 3 + REVEAL 1 + MOVE 1.5 + CONTINUATION 0 + PAYOFF 3
    expect(timeline.duration).toBe(11);
    const finalState = stateAtTime(timeline, timeline.duration);
    expect(finalState.moveLabel?.text).toBe("Re8#");
  });

  it("scales the SOLVE phase with a custom countdown", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 10,
      showEval: false,
    });
    expect(timeline.duration).toBe(24); // default 19 + 5 extra solve seconds
  });

  it("replays PV moves through chess.js, rejecting a story built on an illegal PV", () => {
    const brokenAnalysis: PositionAnalysis = {
      ...PUZZLE_ANALYSIS,
      pv: ["a2a9"], // not even a real square
    };
    expect(() =>
      buildPuzzleStory(PUZZLE_FEN, "white", brokenAnalysis, {
        countdownSeconds: 5,
        showEval: false,
      }),
    ).toThrow();
  });

  it("places a countdown-tick per second, a reveal cue, and landing-synced move cues", () => {
    const timeline = buildPuzzleStory(PUZZLE_FEN, "white", PUZZLE_ANALYSIS, {
      countdownSeconds: 5,
      showEval: false,
    });
    expect(timeline.audioCues).toEqual([
      { time: 2.5, type: "countdown-tick" },
      { time: 3.5, type: "countdown-tick" },
      { time: 4.5, type: "countdown-tick" },
      { time: 5.5, type: "countdown-tick" },
      { time: 6.5, type: "countdown-tick" },
      { time: 7.5, type: "reveal" },
      { time: 10, type: "move" }, // Ra7 lands (MOVE ends)
      { time: 13, type: "move" }, // Kf8 lands (1st continuation ply)
      { time: 16, type: "checkmate" }, // Rh8# lands (2nd continuation ply)
    ]);
  });

  it("emits a checkmate cue with no continuation cues after it for a mate-in-1", () => {
    const timeline = buildPuzzleStory(MATE_IN_1_FEN, "white", MATE_IN_1_ANALYSIS, {
      countdownSeconds: 3,
      showEval: false,
    });
    expect(timeline.audioCues).toEqual([
      { time: 2.5, type: "countdown-tick" },
      { time: 3.5, type: "countdown-tick" },
      { time: 4.5, type: "countdown-tick" },
      { time: 5.5, type: "reveal" },
      { time: 8, type: "checkmate" }, // Re8# lands (MOVE ends), mate-in-1 so no continuation
    ]);
  });
});
