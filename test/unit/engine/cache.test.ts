import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalysisCache, type CacheKeyParams } from "../../../src/engine/cache.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

const PARAMS: CacheKeyParams = {
  fen: "6k1/8/8/8/8/8/R7/K6R w - - 0 1",
  engineVersion: "Stockfish 18",
  depth: 18,
  multiPv: 1,
};

const ANALYSIS: PositionAnalysis = {
  fen: PARAMS.fen,
  engineVersion: PARAMS.engineVersion,
  depth: 18,
  bestMove: "a2a7",
  score: { type: "mate", value: 2, perspective: "white" },
  pv: ["a2a7", "g8f8", "h1h8"],
  multipv: [{ rank: 1, score: { type: "mate", value: 2, perspective: "white" }, moves: ["a2a7"] }],
};

let baseDir: string;
let cache: AnalysisCache;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "chessroll-cache-test-"));
  cache = new AnalysisCache(baseDir);
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("AnalysisCache", () => {
  it("returns undefined for a miss", async () => {
    expect(await cache.get(PARAMS)).toBeUndefined();
  });

  it("round-trips a stored analysis", async () => {
    await cache.set(PARAMS, ANALYSIS);
    expect(await cache.get(PARAMS)).toEqual(ANALYSIS);
  });

  it("keys on engineVersion, so upgrading Stockfish invalidates old entries", async () => {
    await cache.set(PARAMS, ANALYSIS);
    const missed = await cache.get({ ...PARAMS, engineVersion: "Stockfish 19" });
    expect(missed).toBeUndefined();
  });

  it("keys on depth/nodes/multiPv, not just the FEN", async () => {
    await cache.set(PARAMS, ANALYSIS);
    expect(await cache.get({ ...PARAMS, depth: 20 })).toBeUndefined();
    expect(await cache.get({ ...PARAMS, multiPv: 3 })).toBeUndefined();
  });
});
