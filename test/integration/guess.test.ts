import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { buildGuessStory, selectGuessMove } from "../../src/story/guess.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

/**
 * Confirms auto-detection and the engine-comparison honesty framing against
 * the real engine and the already-verified fixture: at depth 18, ply index
 * 12 (White's 7.e5) is confirmed (this session, during fixture generation)
 * to swing +0.1 -> -0.7 while Stockfish's own top choice there was 7.Nc3.
 */
describe("guess-the-move against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("guess-game.pgn"));
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
  }, 60_000);

  it("auto-detects White's 7.e5 as the most decisive moment and honestly reports Stockfish preferred Nc3", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    const candidate = selectGuessMove(game, analyses);
    expect(candidate.ply.san).toBe("e5");
    expect(candidate.plyIndex).toBe(12);

    const timeline = buildGuessStory(game, analyses, candidate, {
      countdownSeconds: 5,
      showEval: true,
    });
    // Find the comparison segment by its distinctive move label + prompt,
    // rather than hand-computing t (lead-in length can shift slightly
    // depending on exactly where plyIndex 12 lands relative to the default
    // 4-ply lead-in window, which is fixed here, but this is more robust).
    const comparison = timeline.segments.find(
      (s) => s.state.moveLabel?.text === "e5" && s.state.prompt !== undefined,
    );
    expect(comparison).toBeDefined();
    expect(comparison!.state.prompt?.text).toBe("STOCKFISH PREFERRED NC3 INSTEAD");
    expect(comparison!.state.prompt?.emphasis).toBeFalsy();
    // Not an exact centipawn value: fixed-depth search isn't guaranteed
    // bit-for-bit reproducible (BLUEPRINT.md §36) — assert the sign/shape
    // (White is clearly, if mildly, worse off) rather than an exact number.
    expect(comparison!.state.evaluation?.display).toMatch(/^-0\.\d$/);
  }, 60_000);

  it("shows 'You are E. Marchetti' at the personalization beat", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 12 });
    const candidate = selectGuessMove(game, analyses, { moveOverride: 13 }); // same ply, forced
    const timeline = buildGuessStory(game, analyses, candidate, {
      countdownSeconds: 5,
      showEval: false,
    });
    const youAre = timeline.segments.find((s) => s.state.title?.text.startsWith("YOU ARE"));
    expect(youAre).toBeDefined();
    expect(youAre!.state.title?.text).toBe("YOU ARE E. MARCHETTI (2340)");
  }, 60_000);
});
