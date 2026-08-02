import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { planAutoStories } from "../../src/story/auto.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

/**
 * Confirms planAutoStories finds the fixture's real, already-verified
 * blunder (14.Qxb6??, see test/integration/replay.test.ts) against the
 * real engine, end to end, not just against fabricated analyses.
 */
describe("planAutoStories against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("replay-game.pgn"));
  let engine: StockfishEngine;

  beforeAll(async () => {
    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    // MultiPV >= 2, same requirement detectBrilliantMoves has everywhere else.
    engine = await StockfishEngine.start({ binaryPath, multiPv: 2 });
  }, 15_000);

  afterAll(async () => {
    await engine.quit();
  });

  it("finds 14.Qxb6?? as a blunder candidate, excludes it from the puzzle pool, and returns other significant moments", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    const plan = planAutoStories(game, analyses);

    const blunderSans = plan.blunders.map((c) => c.ply.san);
    expect(blunderSans).toContain("Qxb6");

    const blunderPlyIndexes = new Set(plan.blunders.map((c) => c.plyIndex));
    for (const puzzle of plan.puzzles) {
      expect(blunderPlyIndexes.has(puzzle.plyIndex)).toBe(false);
    }
    // A 32-ply game with a real blunder in it has more than zero other
    // significant swings to turn into puzzle content.
    expect(plan.puzzles.length).toBeGreaterThan(0);
  }, 90_000);
});
