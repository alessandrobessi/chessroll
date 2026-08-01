import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { buildBlunderStory, selectBlunder } from "../../src/story/blunder.js";
import { stateAtTime } from "../../src/scene/state.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

describe("blunder detection against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("blunder-game.pgn"));
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
    const analyses = await analyzeGame(engine, game, { depth: 14 });
    expect(analyses).toHaveLength(game.plies.length + 1);
    expect(analyses[0]!.fen).toBe(game.initialFen);
    expect(analyses[analyses.length - 1]!.fen).toBe(game.plies[game.plies.length - 1]!.fenAfter);
  }, 60_000);

  it("detects 15...Nxe4?? as the blunder and Bxd8 as the punishment", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    const candidate = selectBlunder(game, analyses);

    expect(candidate.ply.san).toBe("Nxe4");
    expect(candidate.ply.side).toBe("black");
    expect(candidate.afterAnalysis.bestMove).toBe("h4d8"); // Bxd8, winning the queen
    expect(candidate.afterAnalysis.score.value).toBeGreaterThan(400); // White is up a queen-ish

    const timeline = buildBlunderStory(game, candidate, { countdownSeconds: 3, showEval: true });
    const payoffState = stateAtTime(timeline, timeline.duration);
    expect(payoffState.moveLabel?.text).toBe("Bxd8");
  }, 60_000);
});
