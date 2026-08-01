import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { buildReplayStory } from "../../src/story/replay.js";
import { stateAtTime } from "../../src/scene/state.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

/**
 * Confirms the fixture's real, already-verified blunder (14.Qxb6??, +25cp
 * -> -493cp for White, a -518cp swing at depth 16) actually classifies as
 * "critical" once run through the real engine end to end, not just against
 * fabricated analyses.
 */
describe("replay classification against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("replay-game.pgn"));
  let engine: StockfishEngine;

  beforeAll(async () => {
    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    engine = await StockfishEngine.start({ binaryPath });
  }, 15_000);

  afterAll(async () => {
    await engine.quit();
  });

  it("analyzes every position along the game (plies.length + 1 positions)", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    expect(analyses).toHaveLength(game.plies.length + 1);
  }, 60_000);

  it("classifies 14.Qxb6?? as critical, with the '??' blunder annotation and a highlight", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    const timeline = buildReplayStory(game, analyses, { showEval: true });

    // Ply index 26 is White's 14.Qxb6?? — find its pause segment by
    // scanning for the annotated move label rather than hand-computing t,
    // since real engine timings for the other 31 plies vary run to run.
    const critical = timeline.segments.find(
      (segment) => segment.state.moveLabel?.text === "14. Qxb6??",
    );
    expect(critical).toBeDefined();
    expect(critical!.state.moveLabel?.emphasis).toBe(true);
    expect(critical!.state.highlights).toEqual([
      { square: "b3", style: "critical" },
      { square: "b6", style: "critical" },
    ]);
    // A genuine, large, White-perspective evaluation collapse.
    expect(critical!.state.evaluation?.display).toMatch(/^-\d/);
  }, 60_000);

  it("shows the header throughout and the recorded result (0-1) at the outro", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 12 });
    const timeline = buildReplayStory(game, analyses, { showEval: false });
    expect(stateAtTime(timeline, 0).title?.text).toBe("A. Rowan (2100) vs B. Voss (2050)");
    expect(stateAtTime(timeline, 0).subtitle?.text).toBe("Chessroll Fixture Open, 2024");
    const outro = stateAtTime(timeline, timeline.duration);
    expect(outro.title).toEqual({ text: "0-1", emphasis: true });
  }, 60_000);
});
