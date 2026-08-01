import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { buildBrilliantStory, selectBrilliantMove } from "../../src/story/brilliant.js";
import { stateAtTime } from "../../src/scene/state.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

describe("brilliant-move detection against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("brilliant-game.pgn"));
  let engine: StockfishEngine;

  beforeAll(async () => {
    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    // MultiPV >= 2 — the detector needs a runner-up alternative to measure
    // the gap against.
    engine = await StockfishEngine.start({ binaryPath, multiPv: 2 });
  }, 15_000);

  afterAll(async () => {
    await engine.quit();
  });

  it("analyzes every position along the game (plies.length + 1 positions)", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    expect(analyses).toHaveLength(game.plies.length + 1);
  }, 30_000);

  it("detects 1.Qg8+!! as the standout move — a genuine forced-mate queen sacrifice", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 18 });
    const candidate = selectBrilliantMove(game, analyses);

    expect(candidate.ply.san).toBe("Qg8+");
    expect(candidate.ply.side).toBe("white");
    expect(candidate.isSacrifice).toBe(true);
    expect(candidate.afterAnalysis.score.type).toBe("mate");

    const timeline = buildBrilliantStory(game, candidate, { countdownSeconds: 3, showEval: true });
    const payoffState = stateAtTime(timeline, timeline.duration);
    expect(payoffState.moveLabel?.text).toBe("Qg8+!!");
    expect(payoffState.evaluation?.display).toMatch(/^M\d+$/);
  }, 30_000);
});
