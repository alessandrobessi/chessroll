import { sideToMoveFromFen } from "../chess/fen.js";
import type { ChessGame, Side } from "../chess/types.js";
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

export interface AnalyzeGameOptions {
  depth?: number;
  nodes?: number;
  cache?: AnalysisCache;
  useCache?: boolean;
}

/**
 * Analyzes every position along a game: `result[i]` is the analysis of the
 * position BEFORE `game.plies[i]`, so `result.length === game.plies.length
 * + 1` (the last entry is the final position, after the last ply).
 * Positions are analyzed sequentially and each one is independently
 * cacheable, so re-running against the same game/engine/depth is cheap.
 */
export async function analyzeGame(
  engine: StockfishEngine,
  game: ChessGame,
  options: AnalyzeGameOptions,
): Promise<PositionAnalysis[]> {
  const fens = [game.initialFen, ...game.plies.map((ply) => ply.fenAfter)];
  const results: PositionAnalysis[] = [];
  for (const fen of fens) {
    results.push(
      await analyzePosition(engine, {
        fen,
        sideToMove: sideToMoveFromFen(fen),
        depth: options.depth,
        nodes: options.nodes,
        cache: options.cache,
        useCache: options.useCache,
      }),
    );
  }
  return results;
}
