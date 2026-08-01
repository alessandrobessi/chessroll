import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisCache } from "../../src/engine/cache.js";
import { analyzePosition } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";
import { findExecutable } from "../../src/utils/process.js";
import { CliArgumentError } from "../../src/utils/errors.js";

const PUZZLE_FEN = "6k1/8/8/8/8/8/R7/K6R w - - 0 1";

describe("StockfishEngine (real engine process)", () => {
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

  it("reports an engine version from the id name line", () => {
    expect(engine.engineVersion).toMatch(/Stockfish/i);
  });

  it("finds the only forced mate on the verified puzzle fixture", async () => {
    const raw = await engine.analyze({ fen: PUZZLE_FEN, depth: 12 });
    expect(raw.bestMove).toBe("a2a7");
    expect(raw.lines.length).toBeGreaterThan(0);
    expect(raw.lines[0]!.score.type).toBe("mate");
  }, 20_000);

  it("rejects analyze() calls specifying neither or both of depth/nodes", async () => {
    await expect(engine.analyze({ fen: PUZZLE_FEN })).rejects.toThrow(CliArgumentError);
    await expect(engine.analyze({ fen: PUZZLE_FEN, depth: 10, nodes: 1000 })).rejects.toThrow(
      CliArgumentError,
    );
  });
});

describe("analyzePosition (normalization + cache)", () => {
  let engine: StockfishEngine;
  let cacheDir: string;
  let cache: AnalysisCache;

  beforeAll(async () => {
    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    engine = await StockfishEngine.start({ binaryPath });
  }, 15_000);

  afterAll(async () => {
    await engine.quit();
  });

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "chessroll-analysis-cache-"));
    cache = new AnalysisCache(cacheDir);
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("normalizes the mate score to White's perspective and finds the forced line", async () => {
    const analysis = await analyzePosition(engine, {
      fen: PUZZLE_FEN,
      sideToMove: "white",
      depth: 12,
      cache,
    });
    expect(analysis.bestMove).toBe("a2a7");
    expect(analysis.score.type).toBe("mate");
    expect(analysis.score.value).toBeGreaterThan(0); // White is winning/mating
    expect(analysis.score.perspective).toBe("white");
  }, 20_000);

  it("serves a second identical request from cache without calling the engine again", async () => {
    const first = await analyzePosition(engine, {
      fen: PUZZLE_FEN,
      sideToMove: "white",
      depth: 12,
      cache,
    });

    const analyzeSpy = vi.spyOn(engine, "analyze");
    const second = await analyzePosition(engine, {
      fen: PUZZLE_FEN,
      sideToMove: "white",
      depth: 12,
      cache,
    });

    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    analyzeSpy.mockRestore();
  }, 20_000);

  it("bypasses the cache entirely when useCache is false", async () => {
    await analyzePosition(engine, { fen: PUZZLE_FEN, sideToMove: "white", depth: 12, cache });

    const analyzeSpy = vi.spyOn(engine, "analyze");
    await analyzePosition(engine, {
      fen: PUZZLE_FEN,
      sideToMove: "white",
      depth: 12,
      cache,
      useCache: false,
    });

    expect(analyzeSpy).toHaveBeenCalledOnce();
    analyzeSpy.mockRestore();
  }, 20_000);
});
