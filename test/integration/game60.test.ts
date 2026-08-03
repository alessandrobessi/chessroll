import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { buildGame60Story } from "../../src/story/game60.js";
import { findExecutable } from "../../src/utils/process.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

/**
 * Confirms the fixture's real, already-verified blunder (18.Bg6??, +18cp ->
 * -417cp for White at depth 16) actually classifies as critical against the
 * real engine, and that the budget/scale math genuinely compresses this
 * 70-ply game when given a tight target (its unscaled base-seconds sum is
 * ~28s, comfortably under the 60s default — see the fixture-generation
 * notes in test/fixtures/game60-game.pgn's originating commit — so a tight
 * target is what actually exercises compression here).
 */
describe("game60 pacing against the real engine and the verified fixture", () => {
  const game = loadPgn(fixture("game60-game.pgn"));
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
    const analyses = await analyzeGame(engine, game, { depth: 12 });
    expect(analyses).toHaveLength(game.plies.length + 1);
  }, 120_000);

  it("classifies 18.Bg6?? as critical and lands the total duration at a tight target via compression", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 12 });

    const relaxed = buildGame60Story(game, analyses, { targetSeconds: 60, showEval: true });
    const tight = buildGame60Story(game, analyses, { targetSeconds: 20, showEval: true });

    const relaxedCritical = relaxed.segments.find((s) => s.state.moveLabel?.text === "18. Bg6??");
    const tightCritical = tight.segments.find((s) => s.state.moveLabel?.text === "18. Bg6??");
    expect(relaxedCritical).toBeDefined();
    expect(tightCritical).toBeDefined();
    expect(relaxedCritical!.state.highlights).toEqual([
      { square: "d3", style: "blunder" },
      { square: "g6", style: "blunder" },
    ]);
    expect(relaxedCritical!.state.moveQualityBadge).toEqual({
      square: "g6",
      tier: "blunder",
      glyph: "??",
    });

    // 60s target comfortably exceeds this game's unscaled pacing (~33s) ->
    // no compression, scale clamps to 1. 20s does not -> genuine compression.
    expect(relaxed.duration).toBeLessThan(60);
    expect(tight.duration).toBeCloseTo(20, 0);
    expect(tight.duration).toBeLessThan(relaxed.duration);
  }, 120_000);

  it("shows the header throughout, with no invented result (the fixture's game is unfinished), plus a real accuracy summary", async () => {
    const analyses = await analyzeGame(engine, game, { depth: 10 });
    const timeline = buildGame60Story(game, analyses, { targetSeconds: 30, showEval: false });
    expect(timeline.segments[0]!.state.bottomPlayer?.text).toBe("C. Ibarra (2210)");
    expect(timeline.segments[0]!.state.topPlayer?.text).toBe("D. Solheim (2190)");
    const outro = timeline.segments[timeline.segments.length - 1]!;
    expect(outro.state.title).toBeUndefined();
    expect(outro.state.subtitle?.text).toMatch(/^C\. Ibarra \d+\.\d% {3}D\. Solheim \d+\.\d%$/);
  }, 120_000);
});
