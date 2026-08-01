import type { Side } from "../chess/types.js";
import type { AnalysisCache, CacheKeyParams } from "./cache.js";
import { normalizeScore } from "./normalize.js";
import type { StockfishEngine } from "./stockfish.js";

export interface EngineScore {
  type: "cp" | "mate";
  value: number;
  perspective: "white";
}

export interface CandidateLine {
  rank: number;
  score: EngineScore;
  moves: string[];
}

export interface PositionAnalysis {
  fen: string;
  engineVersion: string;
  depth?: number;
  nodes?: number;
  bestMove: string;
  score: EngineScore;
  pv: string[];
  multipv: CandidateLine[];
}

export interface AnalyzePositionOptions {
  fen: string;
  sideToMove: Side;
  depth?: number;
  nodes?: number;
  cache?: AnalysisCache;
  /** Bypasses both cache read and write (the CLI's --no-cache). Default true. */
  useCache?: boolean;
}

/**
 * Runs (or reuses a cached) Stockfish analysis and normalizes the raw,
 * side-to-move-relative scores to White's perspective before anything else
 * in the app sees them.
 */
export async function analyzePosition(
  engine: StockfishEngine,
  options: AnalyzePositionOptions,
): Promise<PositionAnalysis> {
  const { fen, sideToMove, depth, nodes, cache, useCache = true } = options;
  const cacheParams: CacheKeyParams = {
    fen,
    engineVersion: engine.engineVersion,
    depth,
    nodes,
    multiPv: engine.multiPv,
  };

  if (cache && useCache) {
    const cached = await cache.get(cacheParams);
    if (cached) return cached;
  }

  const raw = await engine.analyze({ fen, depth, nodes });
  const multipv: CandidateLine[] = raw.lines.map((line) => ({
    rank: line.multipv ?? 1,
    score: normalizeScore(line.score, sideToMove),
    moves: line.pv,
  }));
  const best = multipv.find((line) => line.rank === 1) ?? multipv[0]!;

  const analysis: PositionAnalysis = {
    fen,
    engineVersion: raw.engineVersion,
    depth,
    nodes,
    bestMove: raw.bestMove,
    score: best.score,
    pv: best.moves,
    multipv,
  };

  if (cache && useCache) {
    await cache.set(cacheParams, analysis);
  }

  return analysis;
}
